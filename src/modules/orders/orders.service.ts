import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // PDV SALE (Venda Direta)
  // ==========================================
  async processPosSale(tenantId: string, data: any) {
    const { customerName, method, items, cashierName } = data;
    
    if (!items || items.length === 0) {
      throw new BadRequestException('A venda não possui itens.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        let totalAmount = 0;
        const processedItems = [];

        for (const item of items) {
          // Captura qualquer variação de nome de ID vinda do Front
          const pid = item.productId || item.id || item.inventoryItemId;
          
          if (!pid) {
            throw new BadRequestException('ID do produto não fornecido.');
          }

          // 🛡️ BUSCA BLINDADA: Tenta achar o produto pelo ID dele OU pelo ID do Insumo vinculado
          const product = await tx.products.findFirst({
            where: { 
              tenant_id: tenantId,
              OR: [
                { id: pid },
                { linked_inventory_item_id: pid }
              ]
            },
          });

          if (!product) {
            console.error(`❌ Produto não encontrado. ID pesquisado: ${pid} | Tenant: ${tenantId}`);
            throw new NotFoundException(`Produto ${pid} não localizado no sistema para este restaurante.`);
          }

          const unitPrice = Number(product.price || 0);
          const qty = Number(item.quantity || 1);
          totalAmount += unitPrice * qty;

          processedItems.push({
            productId: product.id,
            name: product.name,
            price: unitPrice,
            quantity: qty,
            type: product.type || 'SIMPLE',
            inventoryItemId: product.linked_inventory_item_id,
          });
        }

        // 1. Criar o pedido (orders)
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            order_type: 'PDV',
            status: 'COMPLETED',
            is_paid: true,
            customer_name: customerName || 'Consumidor Final',
            total_amount: totalAmount,
          },
        });

        // 2. Criar itens e baixar estoque
        for (const pItem of processedItems) {
          if (pItem.inventoryItemId) {
            await tx.inventory_items.update({
              where: { id: pItem.inventoryItemId },
              data: { quantity: { decrement: pItem.quantity } },
            });
          }

          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: pItem.productId,
              inventory_item_id: pItem.inventoryItemId || null,
              quantity: pItem.quantity,
              product_name: pItem.name,
              product_price: pItem.price,
              product_type: pItem.type,
              status: 'COMPLETED',
            } as any,
          });
        }

        // 3. Registrar Transação Financeira
        await tx.transactions.create({
          data: {
            tenant_id: tenantId,
            order_id: order.id,
            amount: totalAmount,
            method: method || 'DINHEIRO',
            cashier_name: cashierName || 'Sistema',
            status: 'COMPLETED',
          },
        });

        return { success: true, orderId: order.id, total: totalAmount };
      });
    } catch (error: any) {
      console.error('🚨 Erro Crítico PDV:', error);
      throw new BadRequestException(error.message || 'Erro ao processar venda');
    }
  }

  // ==========================================
  // PLACE ORDER (Mesas / Delivery)
  // ==========================================
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    if (!items || items.length === 0) throw new BadRequestException('Pedido sem itens.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            table_id: tableId || null,
            order_type: type || 'DINE_IN',
            status: 'PENDING',
            is_paid: false,
            delivery_info: deliveryInfo || null,
          },
        });

        for (const item of items) {
          const pid = item.productId || item.id || item.inventoryItemId;
          const product = await tx.products.findFirst({
            where: { 
              tenant_id: tenantId,
              OR: [{ id: pid }, { linked_inventory_item_id: pid }]
            }
          });

          const invId = product?.linked_inventory_item_id;

          if (invId) {
            await tx.inventory_items.update({
              where: { id: invId },
              data: { quantity: { decrement: item.quantity } },
            });
          }

          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: product?.id || pid,
              inventory_item_id: invId || null,
              quantity: item.quantity,
              product_name: product?.name || 'Produto',
              product_price: Number(product?.price || 0),
              product_type: product?.type || 'SIMPLE',
              status: 'PENDING',
            } as any,
          });
        }
        return order;
      });
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  // ==========================================
  // PAYMENT / FINANCEIRO
  // ==========================================
  async processPayment(tenantId: string, data: any) {
    const { tableId, orderId, amount, cashierName, method } = data;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (tableId) {
          await tx.orders.updateMany({
            where: { tenant_id: tenantId, table_id: tableId, is_paid: false },
            data: { is_paid: true, status: 'COMPLETED' },
          });
          await tx.restaurant_tables.update({
            where: { id: tableId },
            data: { status: 'AVAILABLE', customer_name: null, access_code: null },
          });
        }
        if (orderId) {
          await tx.orders.updateMany({
            where: { id: orderId, tenant_id: tenantId },
            data: { is_paid: true, status: 'COMPLETED' },
          });
        }
        await tx.transactions.create({
          data: {
            tenant_id: tenantId,
            order_id: orderId || null,
            amount: Number(amount) || 0,
            method: method || 'DINHEIRO',
            cashier_name: cashierName || 'Sistema',
            status: 'COMPLETED',
          },
        });
        return { success: true };
      });
    } catch (error: any) {
      throw new BadRequestException('Erro no pagamento');
    }
  }

  // ==========================================
  // CANCELAMENTO / STATUS
  // ==========================================
  async cancelOrder(tenantId: string, orderId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const items = await tx.order_items.findMany({
          where: { order_id: orderId, tenant_id: tenantId },
        });
        for (const item of items) {
          if (item.inventory_item_id) {
            await tx.inventory_items.update({
              where: { id: item.inventory_item_id },
              data: { quantity: { increment: item.quantity } },
            });
          }
        }
        await tx.orders.updateMany({
          where: { id: orderId, tenant_id: tenantId },
          data: { deleted_at: new Date(), status: 'CANCELLED' },
        });
        return { success: true };
      });
    } catch (error: any) {
      throw new BadRequestException('Erro ao cancelar pedido');
    }
  }

  async dispatchOrder(tenantId: string, orderId: string, courierInfo: any) {
    await this.prisma.orders.updateMany({
      where: { id: orderId, tenant_id: tenantId },
      data: { status: 'DISPATCHED', delivery_info: courierInfo || null },
    });
    return { success: true };
  }

  async updateItemStatus(tenantId: string, itemId: string, status: string) {
    await this.prisma.order_items.updateMany({
      where: { id: itemId, tenant_id: tenantId },
      data: { status },
    });
    return { success: true };
  }
}
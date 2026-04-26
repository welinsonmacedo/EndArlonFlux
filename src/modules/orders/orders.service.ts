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
  // PDV SALE (Venda Direta de Balcão)
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
          // Captura o ID enviado pelo Front (CommercePOS envia id ou inventoryItemId)
          const pid = item.id || item.inventoryItemId || item.productId;
          
          if (!pid) {
            throw new BadRequestException('ID do produto não encontrado no item enviado.');
          }

          // Busca o produto real. Nota: No seu Prisma o campo é linked_inventory_item_id
          const product = await tx.products.findFirst({
            where: { 
              OR: [
                { id: pid },
                { linked_inventory_item_id: pid }
              ],
              tenant_id: tenantId 
            },
          });

          if (!product) {
            throw new NotFoundException(`Produto ${pid} não localizado.`);
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
            inventoryItemId: product.linked_inventory_item_id, // Nome corrigido p/ Prisma
          });
        }

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

        for (const pItem of processedItems) {
          if (pItem.inventoryItemId) {
            await tx.inventory_items.update({
              where: { id: pItem.inventoryItemId },
              data: { quantity: { decrement: pItem.quantity } }, // Nome corrigido p/ quantity
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
      console.error('Erro PDV:', error);
      throw new BadRequestException(error.message || 'Erro ao processar venda');
    }
  }

  // ==========================================
  // PLACE ORDER (Mesa / Delivery)
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
          const pid = item.productId || item.id;
          const product = await tx.products.findFirst({
            where: { 
              OR: [{ id: pid }, { linked_inventory_item_id: pid }],
              tenant_id: tenantId 
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
  // PAYMENT (Fechar conta)
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
            table_id: tableId || null,
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
  // CANCELAMENTO (Devolve Stock)
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

  // ==========================================
  // DISPATCH E STATUS
  // ==========================================
  async dispatchOrder(tenantId: string, orderId: string, courierInfo: any) {
    const result = await this.prisma.orders.updateMany({
      where: { id: orderId, tenant_id: tenantId },
      data: { status: 'DISPATCHED', delivery_info: courierInfo || null },
    });
    if (result.count === 0) throw new NotFoundException('Pedido não encontrado');
    return { success: true };
  }

  async updateItemStatus(tenantId: string, itemId: string, status: string) {
    const result = await this.prisma.order_items.updateMany({
      where: { id: itemId, tenant_id: tenantId },
      data: { status },
    });
    if (result.count === 0) throw new NotFoundException('Item não encontrado');
    return { success: true };
  }
}
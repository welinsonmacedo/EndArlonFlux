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
          // 🛡️ EXPLICAÇÃO: O Front envia "id", mas aceitamos "productId" ou "product_id" por segurança.
          const productId = item.id || item.productId || item.product_id;
          
          if (!productId) {
            throw new BadRequestException('ID do produto não fornecido (campo "id" ausente).');
          }

          // Busca o produto real para garantir o PREÇO oficial e o TIPO (product_type)
          const product = await tx.products.findUnique({
            where: { id: productId, tenant_id: tenantId },
          });

          if (!product) {
            throw new NotFoundException(`Produto ${productId} não encontrado.`);
          }

          const unitPrice = Number(product.price || 0);
          const qty = Number(item.quantity || 1);
          totalAmount += unitPrice * qty;

          processedItems.push({
            productId: product.id,
            name: product.name,
            price: unitPrice,
            quantity: qty,
            type: product.type || 'KITCHEN',
            // Captura o inventoryItemId do Front ou usa o vinculado ao produto
            inventoryItemId: item.inventoryItemId || item.inventory_item_id || product.linked_inventory_item_id,
          });
        }

        // 1. Criar o pedido principal (Orders)
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            order_type: 'PDV',
            status: 'COMPLETED',
            is_paid: true,
            customer_name: customerName || null,
            total_amount: totalAmount,
          },
        });

        // 2. Criar itens e atualizar stock (Order Items)
        for (const item of processedItems) {
          if (item.inventoryItemId) {
            await tx.inventory_items.update({
              where: { id: item.inventoryItemId },
              data: { quantity: { decrement: item.quantity } },
            });
          }

          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id, 
              product_id: item.productId,
              inventory_item_id: item.inventoryItemId || null,
              quantity: item.quantity,
              product_name: item.name,
              product_price: item.price,
              product_type: item.type,
              status: 'COMPLETED',
            } as any,
          });
        }

        // 3. Registro Financeiro (Transactions)
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
  // PLACE ORDER (Mesa / QR Code / Delivery)
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
          const productId = item.id || item.productId || item.product_id;
          const product = await tx.products.findUnique({
            where: { id: productId, tenant_id: tenantId }
          });

          const invId = item.inventoryItemId || item.inventory_item_id || product?.linked_inventory_item_id;

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
              product_id: productId,
              inventory_item_id: invId || null,
              quantity: item.quantity,
              product_name: product?.name || 'Produto',
              product_price: Number(product?.price || 0),
              product_type: product?.type || 'KITCHEN',
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
  // PAGAMENTO (Financeiro)
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
  // CANCELAMENTO
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
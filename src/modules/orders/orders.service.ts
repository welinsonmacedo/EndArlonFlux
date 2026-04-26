import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // VALIDADORES PRIVADOS
  // =========================
  private validateItems(items: any[]) {
    if (!items || items.length === 0) {
      throw new BadRequestException('O pedido precisa ter itens.');
    }
  }

  private validatePaymentInput(tableId?: string, orderId?: string) {
    if (!tableId && !orderId) {
      throw new BadRequestException('Informe tableId ou orderId');
    }
    if (tableId && orderId) {
      throw new BadRequestException('Não envie tableId e orderId juntos');
    }
  }

  // =========================
  // PLACE ORDER (Mesas / Delivery)
  // =========================
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    this.validateItems(items);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Criar pedido principal
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

        // 2. Processar itens e estoque
        for (const item of items) {
          if (item.inventoryItemId) {
            const inventory = await tx.inventory_items.findUnique({
              where: { id: item.inventoryItemId },
            });

            if (!inventory) throw new NotFoundException(`Item de estoque não encontrado: ${item.name}`);
            if (inventory.quantity < item.quantity) {
              throw new BadRequestException(`Estoque insuficiente para ${item.name}`);
            }

            await tx.inventory_items.update({
              where: { id: item.inventoryItemId },
              data: { quantity: { decrement: item.quantity } },
            });
          }

          // FIX: Usando IDs diretos para evitar erro TS2322 (XOR)
          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id, // ID DIRETO
              product_id: item.productId || null,
              inventory_item_id: item.inventoryItemId || null,
              quantity: item.quantity,
              product_name: item.name || 'Produto',
              product_price: Number(item.salePrice) || 0,
              notes: item.notes || null,
              status: 'PENDING',
              product_type: item.type || 'KITCHEN',
            } as any,
          });
        }
        return order;
      });

      return { success: true, order: result };
    } catch (error: any) {
      console.error('Erro no placeOrder:', error);
      throw new BadRequestException(error.message || 'Erro ao criar pedido');
    }
  }

  // =========================
  // PDV SALE (Venda Direta)
  // =========================
  async processPosSale(tenantId: string, data: any) {
    const { customerName, method, items, cashierName } = data;
    this.validateItems(items);

    const totalAmount = items.reduce((acc, item) => {
      return acc + (Number(item.salePrice) || 0) * (Number(item.quantity) || 1);
    }, 0);

    try {
      return await this.prisma.$transaction(async (tx) => {
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

        for (const item of items) {
          if (item.inventoryItemId) {
            await tx.inventory_items.update({
              where: { id: item.inventoryItemId },
              data: { quantity: { decrement: Number(item.quantity) || 1 } },
            });
          }

          // FIX: Usando IDs diretos para evitar erro TS2322 (XOR)
          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id, // ID DIRETO
              product_id: item.productId || null,
              inventory_item_id: item.inventoryItemId || null,
              quantity: Number(item.quantity) || 1,
              notes: item.notes || null,
              status: 'COMPLETED',
              product_name: item.name || 'Produto',
              product_price: Number(item.salePrice) || 0,
              product_type: item.type || 'PVD',
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

        return { success: true, orderId: order.id };
      });
    } catch (error: any) {
      console.error('Erro no processPosSale:', error);
      throw new BadRequestException(error.message || 'Erro ao processar venda PDV');
    }
  }

  // =========================
  // PAYMENT (Fechar conta de Mesa)
  // =========================
  async processPayment(tenantId: string, data: any) {
    const { tableId, orderId, amount, cashierName, method } = data;
    this.validatePaymentInput(tableId, orderId);

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
          const result = await tx.orders.updateMany({
            where: { id: orderId, tenant_id: tenantId },
            data: { is_paid: true, status: 'COMPLETED' },
          });
          if (result.count === 0) throw new NotFoundException('Pedido não encontrado');
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
      console.error('Erro no processPayment:', error);
      throw new BadRequestException(error.message || 'Erro no pagamento');
    }
  }

  // =========================
  // OUTRAS ROTAS (Status, Cancelamento e Despacho)
  // =========================
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

        const result = await tx.orders.updateMany({
          where: { id: orderId, tenant_id: tenantId },
          data: { deleted_at: new Date(), status: 'CANCELLED' },
        });

        if (result.count === 0) throw new NotFoundException('Pedido não encontrado');
        return { success: true };
      });
    } catch (error: any) {
      console.error('Erro no cancelOrder:', error);
      throw new BadRequestException(error.message || 'Erro ao cancelar pedido');
    }
  }

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
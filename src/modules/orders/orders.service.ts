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
  // VALIDADORES
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
      throw new BadRequestException(
        'Não envie tableId e orderId juntos',
      );
    }
  }

  // =========================
  // PLACE ORDER
  // =========================
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;

    this.validateItems(items);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Criar pedido
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

        // 2. Processar itens em paralelo
        await Promise.all(
          items.map(async (item) => {
            // 🔒 VALIDAR ESTOQUE
            if (item.inventoryItemId) {
              const inventory = await tx.inventory_items.findUnique({
                where: { id: item.inventoryItemId },
              });

              if (!inventory) {
                throw new NotFoundException(
                  `Item de estoque não encontrado`,
                );
              }

              if (inventory.quantity < item.quantity) {
                throw new BadRequestException(
                  `Estoque insuficiente para ${item.name}`,
                );
              }
            }

            // Criar item
            await tx.order_items.create({
              data: {
                tenant_id: tenantId,
                order_id: order.id,
                product_id: item.productId || null,
                inventory_item_id: item.inventoryItemId || null,
                quantity: item.quantity,
                product_name: item.name || 'Produto',
                product_price: item.salePrice || 0,
                notes: item.notes || null,
                status: 'PENDING',
                product_type: item.type || 'KITCHEN',
              },
            });

            // Baixar estoque
            if (item.inventoryItemId) {
              await tx.inventory_items.update({
                where: { id: item.inventoryItemId },
                data: {
                  quantity: { decrement: item.quantity },
                },
              });
            }
          }),
        );

        return order;
      });

      return { success: true, order: result };
    } catch (error: any) {
      console.error(error);
      throw new BadRequestException(
        error.message || 'Erro ao criar pedido',
      );
    }
  }

  // =========================
  // PDV SALE
  // =========================
  async processPosSale(tenantId: string, data: any) {
    const { items } = data;

    this.validateItems(items);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            order_type: 'PDV',
            status: 'COMPLETED',
            is_paid: true,
          },
        });

        await Promise.all(
          items.map(async (item) => {
            // validar estoque
            if (item.inventoryItemId) {
              const inventory = await tx.inventory_items.findUnique({
                where: { id: item.inventoryItemId },
              });

              if (!inventory || inventory.quantity < item.quantity) {
                throw new BadRequestException(
                  `Estoque insuficiente para ${item.name}`,
                );
              }
            }

            await tx.order_items.create({
              data: {
                tenant_id: tenantId,
                order_id: order.id,
                product_id: item.productId || null,
                inventory_item_id: item.inventoryItemId || null,
                quantity: item.quantity,
                product_name: item.name || 'Produto Balcão',
                product_price: item.salePrice || 0,
                notes: item.notes || null,
                status: 'COMPLETED',
                product_type: item.type || 'KITCHEN',
              },
            });

            if (item.inventoryItemId) {
              await tx.inventory_items.update({
                where: { id: item.inventoryItemId },
                data: {
                  quantity: { decrement: item.quantity },
                },
              });
            }
          }),
        );

        return { success: true, order };
      });
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Erro no PDV');
    }
  }

  // =========================
  // PAYMENT
  // =========================
  async processPayment(tenantId: string, data: any) {
    const { tableId, orderId, amount,cashierName ,method } = data;

    this.validatePaymentInput(tableId, orderId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (tableId) {
          await tx.orders.updateMany({
            where: {
              tenant_id: tenantId,
              table_id: tableId,
              is_paid: false,
            },
            data: {
              is_paid: true,
              status: 'COMPLETED',
            },
          });

          await tx.restaurant_tables.update({
            where: { id: tableId },
            data: {
              status: 'AVAILABLE',
              customer_name: null,
              access_code: null,
            },
          });
        }

        if (orderId) {
          const updated = await tx.orders.updateMany({
            where: { id: orderId, tenant_id: tenantId },
            data: {
              is_paid: true,
              status: 'COMPLETED',
            },
          });

          if (updated.count === 0) {
            throw new NotFoundException('Pedido não encontrado');
          }
        }

        // 💰 REGISTRO DE PAGAMENTO
        // Registar o fluxo de caixa na tabela correta (transactions)
        await tx.transactions.create({
          data: {
            tenant_id: tenantId,
            table_id: tableId || null,
            order_id: orderId || null,
            amount: amount,
            method: method,
            cashier_name: cashierName || 'Sistema',
            status: 'COMPLETED'
          },
        });

        return { success: true };
      });
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Erro no pagamento');
    }
  }

  // =========================
  // CANCEL ORDER (com devolução de estoque)
  // =========================
  async cancelOrder(tenantId: string, orderId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const items = await tx.order_items.findMany({
          where: { order_id: orderId, tenant_id: tenantId },
        });

        // devolver estoque
        await Promise.all(
          items.map(async (item) => {
            if (item.inventory_item_id) {
              await tx.inventory_items.update({
                where: { id: item.inventory_item_id },
                data: {
                  quantity: { increment: item.quantity },
                },
              });
            }
          }),
        );

        const result = await tx.orders.updateMany({
          where: { id: orderId, tenant_id: tenantId },
          data: {
            deleted_at: new Date(),
            status: 'CANCELLED',
          },
        });

        if (result.count === 0) {
          throw new NotFoundException('Pedido não encontrado');
        }

        return { success: true };
      });
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Erro ao cancelar pedido');
    }
  }

  // =========================
  // DISPATCH
  // =========================
  async dispatchOrder(
    tenantId: string,
    orderId: string,
    courierInfo: any,
  ) {
    try {
      const result = await this.prisma.orders.updateMany({
        where: { id: orderId, tenant_id: tenantId },
        data: {
          status: 'DISPATCHED',
          delivery_info: courierInfo || null,
        },
      });

      if (result.count === 0) {
        throw new NotFoundException('Pedido não encontrado');
      }

      return { success: true };
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Erro ao despachar pedido');
    }
  }

  // =========================
  // UPDATE ITEM STATUS
  // =========================
  async updateItemStatus(
    tenantId: string,
    itemId: string,
    status: string,
  ) {
    try {
      const result = await this.prisma.order_items.updateMany({
        where: { id: itemId, tenant_id: tenantId },
        data: { status },
      });

      if (result.count === 0) {
        throw new NotFoundException('Item não encontrado');
      }

      return { success: true };
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Erro ao atualizar item');
    }
  }
}
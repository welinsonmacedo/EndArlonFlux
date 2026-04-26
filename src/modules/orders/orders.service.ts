import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // Esta função substitui a sua RPC 'place_order' e os Triggers do Supabase!
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;

    if (!items || items.length === 0) {
      throw new BadRequestException('O pedido tem de conter itens.');
    }

    try {
      // 🚀 INICIAMOS UMA TRANSAÇÃO NO BANCO DE DADOS
      const result = await this.prisma.$transaction(async (tx) => {
        
        // 1. Criamos o Cabeçalho do Pedido
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            table_id: tableId || null,
            type: type || 'DINE_IN',
            status: 'PENDING',
            is_paid: false,
            // Guardamos os dados de delivery no formato JSON
            delivery_info: deliveryInfo ? deliveryInfo : null, 
          },
        });

        // 2. Para cada item do pedido, salvamos o item e BAIXAMOS O ESTOQUE
        for (const item of items) {
          // Criar o item no pedido
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

          // 3. A SUBSTITUIÇÃO DO TRIGGER DO SUPABASE:
          // Se o item estiver ligado ao inventário, reduzimos a quantidade
          if (item.inventoryItemId) {
            await tx.inventory_items.update({
              where: { id: item.inventoryItemId },
              data: {
                quantity: {
                  decrement: item.quantity, // <- Magia do Prisma que diminui com segurança
                },
              },
            });
          }
        }

        return order;
      });

      return { success: true, order: result };

    } catch (error) {
      console.error('Erro ao processar pedido:', error);
      throw new BadRequestException('Falha ao registar o pedido e processar estoque.');
    }
  }
}
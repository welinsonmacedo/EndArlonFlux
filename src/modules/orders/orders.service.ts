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
  // 1. FUNÇÃO DE VENDA NO BALCÃO (PDV)
  async processPosSale(tenantId: string, data: any) {
    const { customerName, method, items, cashierName } = data;

    if (!items || items.length === 0) {
      throw new BadRequestException('A venda do PDV tem de conter itens.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Cria o Pedido já pago e concluído
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            type: 'PDV',
            status: 'COMPLETED',
            is_paid: true,
            // Se a sua tabela orders tiver a coluna customer_name, descomente a linha abaixo:
            // customer_name: customerName || 'Balcão', 
          },
        });

        // 2. Insere os itens e baixa o estoque
       for (const item of items) {
          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: item.productId || null,
              inventory_item_id: item.inventoryItemId || null,
              quantity: item.quantity,
              notes: item.notes || null,
              status: 'COMPLETED',
              product_type: item.type || 'KITCHEN',
              
              // 👈 ADICIONE ESTAS DUAS LINHAS:
              product_name: item.name || 'Produto Balcão',
              product_price: item.salePrice || 0,
            },
          });

          // Baixa o estoque do ingrediente/produto se existir
          if (item.inventoryItemId) {
            await tx.inventory_items.update({
              where: { id: item.inventoryItemId },
              data: { quantity: { decrement: item.quantity } },
            });
          }
        }

        return { success: true, order };
      });
    } catch (error) {
      console.error('Erro ao processar venda no PDV:', error);
      throw new BadRequestException('Falha ao registar a venda no PDV.');
    }
  }

  // 2. FUNÇÃO DE PAGAMENTO DE MESAS/PEDIDOS
  async processPayment(tenantId: string, data: any) {
    const { tableId, amount, method, cashierName, orderId, specificOrderIds } = data;

    try {
      return await this.prisma.$transaction(async (tx) => {
        
        // Cenario A: Pagamento total de uma Mesa
        if (tableId) {
          // Marca todos os pedidos pendentes da mesa como pagos
          await tx.orders.updateMany({
            where: { tenant_id: tenantId, table_id: tableId, is_paid: false },
            data: { is_paid: true, status: 'COMPLETED' },
          });

          // Liberta a mesa (Muda o status para disponível)
          await tx.restaurant_tables.update({
            where: { id: tableId },
            data: { status: 'AVAILABLE', customer_name: null, access_code: null },
          });
        } 
        
        // Cenario B: Pagamento de um Pedido Específico
        else if (orderId) {
          await tx.orders.update({
            where: { id: orderId },
            data: { is_paid: true, status: 'COMPLETED' },
          });
        }

        // Se tiver uma tabela específica para registar o fluxo de caixa/pagamentos, 
        // pode adicionar um tx.payments.create(...) aqui!

        return { success: true, message: 'Pagamento registado com sucesso' };
      });
    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      throw new BadRequestException('Falha ao processar o pagamento.');
    }
  }
}
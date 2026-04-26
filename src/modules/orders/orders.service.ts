import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async processPosSale(tenantId: string, data: any) {
    // Mapeamento flexível para os parâmetros do Front
    const { p_customer_name, p_method, p_items, p_cashier_name } = data;
    const items = p_items || data.items || [];
    
    // 🛡️ Captura o ID da sessão de qualquer variante de nome enviada pelo Front
    let sessionId = data.p_cash_session_id || data.cashSessionId || data.cash_session_id || data.sessionId;

    if (items.length === 0) {
      throw new BadRequestException('A venda não possui itens.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 🔄 Se o ID da sessão não veio no payload, busca a última sessão aberta no banco
        if (!sessionId) {
          const activeSession = await tx.cash_sessions.findFirst({
            where: { tenant_id: tenantId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' }
          });
          sessionId = activeSession?.id;
        }

        // Se após a busca no banco ainda for nulo, a transação financeira vai falhar no BD
        if (!sessionId) {
          throw new BadRequestException('Nenhuma sessão de caixa aberta encontrada para processar a venda.');
        }

        let v_total_amount = 0;
        const processedItems = [];

        for (const item of items) {
          const pid = item.productId || item.id || null;
          const qty = Number(item.quantity || 1);

          // Busca idêntica à função SQL do Supabase
          const product = await tx.products.findFirst({
            where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] },
          });

          if (!product) throw new NotFoundException(`Produto ${pid} não encontrado.`);

          const unitPrice = Number(product.price || 0);
          const totalPrice = unitPrice * qty;
          v_total_amount += totalPrice;

          processedItems.push({
            product,
            qty,
            totalPrice,
            inventoryId: product.linked_inventory_item_id
          });
        }

        // 1. Criar Pedido
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            status: 'DELIVERED',
            is_paid: true,
            customer_name: p_customer_name || 'Consumidor Final',
            order_type: 'PDV',
            total_amount: v_total_amount,
          },
        });

        // 2. Criar Itens e Baixar Estoque
        for (const pi of processedItems) {
          if (pi.inventoryId) {
            await tx.inventory_items.update({
              where: { id: pi.inventoryId },
              data: { quantity: { decrement: pi.qty } },
            });
          }

          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: pi.product.id,
              inventory_item_id: pi.inventoryId || null,
              quantity: pi.qty,
              status: 'DELIVERED',
              product_name: pi.product.name,
              product_type: pi.product.type || 'KITCHEN',
              product_price: Number(pi.product.price || 0),
              unit_price: Number(pi.product.price || 0),
              total_price: pi.totalPrice,
              product_cost_price: Number(pi.product.cost_price || 0)
            } as any,
          });
        }

        // 3. Registrar Transação Financeira
        await tx.transactions.create({
          data: {
            tenant_id: tenantId,
            order_id: order.id,
            cash_session_id: sessionId,
            amount: v_total_amount,
            method: p_method || 'DINHEIRO',
            items_summary: 'Venda Balcão (PDV)',
            status: 'COMPLETED',
            cashier_name: p_cashier_name || 'Sistema',
            type: 'INCOME',   
            category: 'SALE'
          } as any,
        });

        return { success: true, order_id: order.id };
      });
    } catch (error: any) {
      console.error('🚨 Erro Crítico PDV:', error);
      throw new BadRequestException(error.message);
    }
  }

  // Manter as demais funções (placeOrder, processPayment, dispatchOrder, updateItemStatus) como estão...
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.create({
        data: { tenant_id: tenantId, table_id: tableId || null, order_type: type || 'DINE_IN', status: 'PENDING', is_paid: false, delivery_info: deliveryInfo || null },
      });
      for (const item of items) {
        const pid = item.productId || item.id;
        const product = await tx.products.findFirst({ where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] } });
        if (product) {
          await tx.order_items.create({
            data: { tenant_id: tenantId, order_id: order.id, product_id: product.id, quantity: item.quantity, product_name: product.name, product_price: Number(product.price || 0), product_type: product.type, status: 'PENDING' } as any
          });
        }
      }
      return order;
    });
  }

  async processPayment(tenantId: string, data: any) {
    const { p_order_id } = data;
    await this.prisma.orders.update({ where: { id: p_order_id }, data: { is_paid: true, status: 'COMPLETED' } });
    return { success: true };
  }

  async cancelOrder(tenantId: string, orderId: string) {
    await this.prisma.orders.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    return { success: true };
  }

  async dispatchOrder(tenantId: string, orderId: string, courierInfo: any) {
    await this.prisma.orders.updateMany({ where: { id: orderId, tenant_id: tenantId }, data: { status: 'DISPATCHED', delivery_info: courierInfo || null } });
    return { success: true };
  }

  async updateItemStatus(tenantId: string, itemId: string, status: string) {
    await this.prisma.order_items.update({ where: { id: itemId }, data: { status } });
    return { success: true };
  }
}
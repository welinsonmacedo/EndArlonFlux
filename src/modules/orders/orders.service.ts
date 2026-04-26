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
  // PDV SALE (Venda Direta - Estrutura Real do DB)
  // ==========================================
  async processPosSale(tenantId: string, data: any) {
    const { p_customer_name, p_method, p_cashier_name } = data;
    const items = data.p_items || data.items || [];
    
    // Captura o ID da sessão de caixa (essencial para o seu sistema)
    let sessionId = data.p_cash_session_id || data.cashSessionId || data.sessionId;

    if (!items || items.length === 0) {
      throw new BadRequestException('A venda não possui itens.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Busca automática de sessão aberta caso não enviada pelo front
        if (!sessionId) {
          const activeSession = await tx.cash_sessions.findFirst({
            where: { tenant_id: tenantId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' }
          });
          sessionId = activeSession?.id;
        }

        if (!sessionId) {
          throw new BadRequestException('Venda bloqueada: Nenhuma sessão de caixa aberta encontrada.');
        }

        let v_total_amount = 0;
        const processedItems = [];

        // 2. Processamento de Itens
        for (const item of items) {
          const pid = item.productId || item.id || item.inventoryItemId;
          if (!pid) continue;

          // Busca hierárquica conforme sua lógica de negócio
          const product = await tx.products.findFirst({
            where: { 
              tenant_id: tenantId,
              OR: [{ id: pid }, { linked_inventory_item_id: pid }]
            },
          });

          let itemData: any;

          if (product) {
            itemData = {
              name: product.name,
              type: product.type || 'KITCHEN',
              price: Number(product.price || 0),
              costPrice: Number(product.cost_price || 0),
              inventoryId: product.linked_inventory_item_id,
              productId: product.id
            };
          } else {
            // Tenta buscar direto no estoque se não for produto
            const invItem = await tx.inventory_items.findFirst({
              where: { id: pid, tenant_id: tenantId }
            });

            if (!invItem) throw new NotFoundException(`Item ${pid} não localizado.`);

            itemData = {
              name: invItem.name,
              type: 'RESALE',
              price: Number((invItem as any).sale_price || 0),
              costPrice: Number(invItem.cost_price || 0),
              inventoryId: invItem.id,
              productId: null
            };
          }

          const qty = Number(item.quantity || 1);
          const totalPrice = itemData.price * qty;
          v_total_amount += totalPrice;

          processedItems.push({ ...itemData, qty, totalPrice, notes: item.notes || '' });
        }

        // 3. Criar o Pedido
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

        // 4. Criar Itens do Pedido e Baixar Estoque
        for (const pItem of processedItems) {
          if (pItem.inventoryId) {
            await tx.inventory_items.update({
              where: { id: pItem.inventoryId },
              data: { quantity: { decrement: pItem.qty } },
            });
          }

          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: pItem.productId,
              inventory_item_id: pItem.inventoryId,
              quantity: pItem.qty,
              notes: pItem.notes,
              status: 'DELIVERED',
              product_name: pItem.name,
              product_type: pItem.type,
              product_price: pItem.price,
              product_cost_price: pItem.costPrice,
              unit_price: pItem.price,
              total_price: pItem.totalPrice,
            } as any,
          });
        }

        // 5. Registrar Transação Financeira (ESTRUTURA EXATA DA SUA TABELA)
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
            // Note: type e category foram removidos pois não existem na sua tabela transactions
          },
        });

        return { success: true, order_id: order.id, total: v_total_amount };
      });
    } catch (error: any) {
      console.error('🚨 Erro PDV:', error.message);
      throw new BadRequestException(error.message);
    }
  }

  // ==========================================
  // OUTRAS FUNÇÕES
  // ==========================================
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
          const invId = product.linked_inventory_item_id;
          if (invId) await tx.inventory_items.update({ where: { id: invId }, data: { quantity: { decrement: item.quantity } } });
          await tx.order_items.create({
            data: { tenant_id: tenantId, order_id: order.id, product_id: product.id, quantity: item.quantity, product_name: product.name, product_price: Number(product.price || 0), product_type: product.type || 'KITCHEN', status: 'PENDING' } as any
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const items = await tx.order_items.findMany({ where: { order_id: orderId, tenant_id: tenantId } });
        for (const item of items) {
          if (item.inventory_item_id) await tx.inventory_items.update({ where: { id: item.inventory_item_id }, data: { quantity: { increment: item.quantity } } });
        }
        await tx.orders.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
        return { success: true };
      });
    } catch (error) { throw new BadRequestException('Erro ao cancelar pedido.'); }
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
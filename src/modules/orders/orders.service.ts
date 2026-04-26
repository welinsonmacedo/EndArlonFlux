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
  // PDV SALE (Venda Direta - Lógica SQL Total)
  // ==========================================
  async processPosSale(tenantId: string, data: any) {
    const { p_customer_name, p_method, p_cashier_name } = data;
    const items = data.p_items || data.items || [];
    let sessionId = data.p_cash_session_id || data.cashSessionId || data.sessionId;

    if (!items || items.length === 0) throw new BadRequestException('A venda não possui itens.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 🔄 Recuperação de Sessão (Obrigatório para o Financeiro)
        if (!sessionId) {
          const activeSession = await tx.cash_sessions.findFirst({
            where: { tenant_id: tenantId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' }
          });
          sessionId = activeSession?.id;
        }
        if (!sessionId) throw new BadRequestException('Não existe sessão de caixa aberta.');

        let v_total_amount = 0;
        const processedItems = [];

        for (const item of items) {
          const pid = item.productId || item.id || item.inventoryItemId;
          if (!pid) continue;

          let v_product_name = 'Produto Desconhecido';
          let v_product_type = 'KITCHEN';
          let v_product_price = 0;
          let v_cost_price = 0;
          let v_final_product_id = null;
          let v_final_inventory_id = null;

          // 1. TENTA BUSCAR EM PRODUTOS
          const product = await tx.products.findFirst({
            where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] },
          });

          if (product) {
            v_product_name = product.name;
            v_product_type = product.type;
            v_product_price = Number(product.price || 0);
            v_cost_price = Number(product.cost_price || 0);
            v_final_product_id = product.id;
            v_final_inventory_id = product.linked_inventory_item_id;
          } else {
            // 2. TENTA BUSCAR DIRETAMENTE NO INVENTÁRIO (Caso o ID seja um insumo sem produto pai)
            const invItem = await tx.inventory_items.findFirst({
              where: { id: pid, tenant_id: tenantId },
            });

            if (invItem) {
              v_product_name = invItem.name;
              v_product_type = 'RESALE'; // Assume revenda se for direto do estoque
              v_product_price = Number((invItem as any).sale_price || 0);
              v_cost_price = Number(invItem.cost_price || 0);
              v_final_inventory_id = invItem.id;
            } else {
              // Se não achou em nenhum lugar, gera o erro 404
              throw new NotFoundException(`Item ${pid} não localizado em Produtos ou Estoque.`);
            }
          }

          const qty = Number(item.quantity || 1);
          const totalPrice = v_product_price * qty;
          v_total_amount += totalPrice;

          processedItems.push({
            productId: v_final_product_id,
            inventoryId: v_final_inventory_id,
            name: v_product_name,
            type: v_product_type,
            price: v_product_price,
            costPrice: v_cost_price,
            qty: qty,
            totalPrice: totalPrice,
            notes: item.notes || ''
          });
        }

        // 3. Criar Pedido
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

        // 4. Criar Order Items e Baixar Stock
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
              inventory_item_id: pItem.inventoryId || null,
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

        // 5. Registrar Transação Financeira
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

        return { success: true, order_id: order.id, total: v_total_amount };
      });
    } catch (error: any) {
      console.error('🚨 Erro Crítico PDV:', error.message);
      throw new BadRequestException(error.message);
    }
  }

  // ==========================================
  // OUTRAS FUNÇÕES (Sincronizadas)
  // ==========================================
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.create({
        data: { tenant_id: tenantId, table_id: tableId || null, order_type: type || 'DINE_IN', status: 'PENDING', is_paid: false, delivery_info: deliveryInfo || null },
      });
      for (const item of items) {
        const pid = item.productId || item.id || item.inventoryItemId;
        if (!pid) continue;
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
    } catch (error: any) { throw new BadRequestException('Erro ao cancelar pedido.'); }
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
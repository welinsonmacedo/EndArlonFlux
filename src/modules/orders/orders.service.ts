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
  // PDV SALE (Venda Direta - Blindagem Total)
  // ==========================================
  async processPosSale(tenantId: string, data: any) {
    // 1. Extração com nomes compatíveis com o seu schema.prisma
    const customerName = data.p_customer_name || data.customerName || 'Consumidor Final';
    const paymentMethod = data.p_method || data.method || 'DINHEIRO'; 
    const cashierName = data.p_cashier_name || data.cashierName || 'Sistema';
    const items = data.p_items || data.items || [];
    
    let sessionId = data.p_cash_session_id || data.cashSessionId || data.sessionId;

    if (items.length === 0) throw new BadRequestException('A venda não possui itens.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 🔄 Busca automática de sessão aberta (Garantia de integridade)
        if (!sessionId) {
          const activeSession = await tx.cash_sessions.findFirst({
            where: { tenant_id: tenantId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' }
          });
          sessionId = activeSession?.id;
        }

        if (!sessionId) throw new BadRequestException('ERRO: Não existe caixa aberto.');

        let totalAmount = 0;
        const processedItems = [];

        for (const item of items) {
          const pid = item.productId || item.id || item.inventoryItemId;
          if (!pid) continue;

          // Busca em cascata usando os campos exatos do seu schema.prisma
          const product = await tx.products.findFirst({
            where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] },
          });

          let pInfo: any;
          if (product) {
            pInfo = {
              id: product.id,
              name: product.name,
              price: Number(product.price || 0),
              type: product.type || 'KITCHEN',
              cost: Number(product.cost_price || 0),
              invId: product.linked_inventory_item_id
            };
          } else {
            const inv = await tx.inventory_items.findFirst({ where: { id: pid, tenant_id: tenantId } });
            if (!inv) throw new NotFoundException(`Item ${pid} não localizado.`);
            pInfo = {
              id: null,
              name: inv.name,
              price: Number((inv as any).sale_price || 0),
              type: 'RESALE',
              cost: Number(inv.cost_price || 0),
              invId: inv.id
            };
          }

          const qty = Number(item.quantity || 1);
          totalAmount += (pInfo.price * qty);
          processedItems.push({ ...pInfo, qty, subtotal: (pInfo.price * qty) });
        }

        // 1. Criar o Pedido
        const order = await tx.orders.create({
          data: {
            tenant_id: tenantId,
            status: 'DELIVERED',
            is_paid: true,
            customer_name: customerName,
            order_type: 'PDV',
            total_amount: totalAmount,
          },
        });

        // 2. Criar Itens do Pedido
        for (const it of processedItems) {
          if (it.invId) {
            await tx.inventory_items.update({
              where: { id: it.invId },
              data: { quantity: { decrement: it.qty } },
            });
          }

          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: it.id,
              inventory_item_id: it.invId,
              quantity: it.qty,
              product_name: it.name,
              product_type: it.type,
              product_price: it.price,
              product_cost_price: it.cost,
              unit_price: it.price,
              total_price: it.subtotal,
              status: 'DELIVERED',
            } as any,
          });
        }

        // 3. Criar Transação (USO DE QUALQUER PARA EVITAR CONFLITO DE SCHEMAS)
        // Mapeamos os campos exatos que estão no seu model 'transactions' do schema.prisma
        await tx.transactions.create({
          data: {
            tenant_id: tenantId,
            order_id: order.id,
            cash_session_id: sessionId,
            amount: totalAmount,
            method: paymentMethod,
            items_summary: 'Venda Balcão (PDV)',
            status: 'COMPLETED',
            cashier_name: cashierName,
          } as any,
        });

        return { success: true, order_id: order.id, total: totalAmount };
      });
    } catch (error: any) {
      console.error('🚨 ERRO NO PROCESSAMENTO PDV:', error);
      throw new BadRequestException(error.message);
    }
  }

  // Métodos adicionais (placeOrder, etc) seguindo a mesma lógica de segurança
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.create({ data: { tenant_id: tenantId, table_id: tableId || null, order_type: type || 'DINE_IN', status: 'PENDING', is_paid: false, delivery_info: deliveryInfo || null } });
      for (const item of items) {
        const pid = item.productId || item.id || item.inventoryItemId;
        if (!pid) continue;
        const product = await tx.products.findFirst({ where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] } });
        if (product) {
          const invId = product.linked_inventory_item_id;
          if (invId) await tx.inventory_items.update({ where: { id: invId }, data: { quantity: { decrement: item.quantity } } });
          await tx.order_items.create({ data: { tenant_id: tenantId, order_id: order.id, product_id: product.id, quantity: item.quantity, product_name: product.name, product_price: Number(product.price || 0), product_type: product.type || 'KITCHEN', status: 'PENDING' } as any });
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
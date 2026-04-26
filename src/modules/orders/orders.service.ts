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
  // PDV SALE (Blindagem Total com SQL Direto)
  // ==========================================
  async processPosSale(tenantId: string, data: any) {
    const customerName = data.p_customer_name || data.customerName || 'Consumidor Final';
    const paymentMethod = data.p_method || data.method || 'DINHEIRO'; 
    const cashierName = data.p_cashier_name || data.cashierName || 'Sistema';
    const items = data.p_items || data.items || [];
    
    let sessionId = data.p_cash_session_id || data.cashSessionId || data.sessionId;

    if (items.length === 0) throw new BadRequestException('A venda não possui itens.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Garantir que a Sessão de Caixa existe
        if (!sessionId) {
          const activeSession = await tx.cash_sessions.findFirst({
            where: { tenant_id: tenantId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' }
          });
          sessionId = activeSession?.id;
        }

        let totalAmount = 0;
        const processedItems = [];

        // 2. Processar Itens e Valores
        for (const item of items) {
          const pid = item.productId || item.id || item.inventoryItemId;
          if (!pid) continue;

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
          const subtotal = pInfo.price * qty;
          totalAmount += subtotal;
          processedItems.push({ ...pInfo, qty, subtotal });
        }

        // 3. Criar o Pedido
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

        // 4. Criar Itens do Pedido e Baixar Estoque
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
            },
          });
        }

        // 5. REGISTRAR TRANSAÇÃO (SOLUÇÃO DE OURO: Bypass do Prisma)
        // Ao invés de usar prisma.transactions.create que estava gerando o erro de Null Constraint,
        // usamos o SQL puro formatado que injeta os dados direto no PostgreSQL igual à sua função.
        if (sessionId) {
          await tx.$executeRaw`
            INSERT INTO public.transactions (
              tenant_id, order_id, cash_session_id, amount, method, items_summary, status, cashier_name
            ) VALUES (
              ${tenantId}::uuid, ${order.id}::uuid, ${sessionId}::uuid, ${totalAmount}, ${paymentMethod}, 'Venda Balcão (PDV)', 'COMPLETED', ${cashierName}
            )
          `;
        } else {
          // Se de forma alguma houver sessão, envia a transação sem session_id
          await tx.$executeRaw`
            INSERT INTO public.transactions (
              tenant_id, order_id, amount, method, items_summary, status, cashier_name
            ) VALUES (
              ${tenantId}::uuid, ${order.id}::uuid, ${totalAmount}, ${paymentMethod}, 'Venda Balcão (PDV)', 'COMPLETED', ${cashierName}
            )
          `;
        }

        return { success: true, order_id: order.id, total: totalAmount };
      });
    } catch (error: any) {
      console.error('🚨 ERRO NO PROCESSAMENTO PDV:', error);
      throw new BadRequestException(error.message || 'Erro interno na venda');
    }
  }

  // ==========================================
  // OUTRAS FUNÇÕES
  // ==========================================
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
          await tx.order_items.create({ data: { tenant_id: tenantId, order_id: order.id, product_id: product.id, quantity: item.quantity, product_name: product.name, product_price: Number(product.price || 0), product_type: product.type || 'KITCHEN', status: 'PENDING' } });
        }
      }
      return order;
    });
  }

  async processPayment(tenantId: string, data: any) {
    await this.prisma.orders.update({ where: { id: data.p_order_id }, data: { is_paid: true, status: 'COMPLETED' } });
    return { success: true };
  }

  async cancelOrder(tenantId: string, orderId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const items = await tx.order_items.findMany({ where: { order_id: orderId, tenant_id: tenantId } });
        for (const item of items) { if (item.inventory_item_id) await tx.inventory_items.update({ where: { id: item.inventory_item_id }, data: { quantity: { increment: item.quantity } } }); }
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
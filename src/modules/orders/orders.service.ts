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
    // Fallbacks agressivos para garantir que NADA seja nulo nas colunas NOT NULL
    const customerName = data.p_customer_name || data.customerName || 'Consumidor Final';
    const paymentMethod = data.p_method || data.method || 'DINHEIRO'; 
    const cashierName = data.p_cashier_name || data.cashierName || 'Sistema';
    const items = data.p_items || data.items || [];
    
    // Captura o sessionId de qualquer lugar possível
    let sessionId = data.p_cash_session_id || data.cashSessionId || data.sessionId;

    if (items.length === 0) {
      throw new BadRequestException('A venda não possui itens.');
    }

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

        if (!sessionId) {
          throw new BadRequestException('ERRO: Não existe caixa aberto para este restaurante.');
        }

        let totalAmount = 0;
        const itemsToCreate = [];

        // Processamento de Itens com busca em cascata (Produtos -> Estoque)
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

          itemsToCreate.push({ ...pInfo, qty, subtotal, notes: item.notes || '' });
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

        // 2. Baixar estoque e Criar itens
        for (const it of itemsToCreate) {
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
              notes: it.notes,
              status: 'DELIVERED',
              product_name: it.name,
              product_type: it.type,
              product_price: it.price,
              product_cost_price: it.cost,
              unit_price: it.price,
              total_price: it.subtotal,
            } as any,
          });
        }

        // 3. Criar Transação (O PONTO DO ERRO)
        // Forçamos o preenchimento de TODAS as colunas que o seu SQL exige como NOT NULL
        const transactionData = {
          tenant_id: tenantId,
          order_id: order.id,
          cash_session_id: sessionId,
          amount: totalAmount,
          method: String(paymentMethod), // Força string para evitar nulo
          items_summary: 'Venda Balcão (PDV)',
          status: 'COMPLETED',
          cashier_name: cashierName,
        };

        console.log('DEBUG: Tentando criar transação com:', transactionData);

        await tx.transactions.create({
          data: transactionData,
        });

        return { success: true, order_id: order.id, total: totalAmount };
      });
    } catch (error: any) {
      console.error('🚨 ERRO FATAL PDV:', error);
      throw new BadRequestException(error.message || 'Erro interno no servidor');
    }
  }

  // Métodos adicionais mantidos para garantir o build (placeOrder, processPayment, cancelOrder, dispatchOrder, updateItemStatus)
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.create({ data: { tenant_id: tenantId, table_id: tableId || null, order_type: type || 'DINE_IN', status: 'PENDING', is_paid: false, delivery_info: deliveryInfo || null } });
      for (const item of items) {
        const pid = item.productId || item.id;
        if (!pid) continue;
        const product = await tx.products.findFirst({ where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] } });
        if (product) {
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
    const items = await this.prisma.order_items.findMany({ where: { order_id: orderId, tenant_id: tenantId } });
    for (const item of items) { if (item.inventory_item_id) await this.prisma.inventory_items.update({ where: { id: item.inventory_item_id }, data: { quantity: { increment: item.quantity } } }); }
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
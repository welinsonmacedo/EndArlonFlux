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
  // PDV SALE (Venda Direta de Balcão)
  // ==========================================
  async processPosSale(tenantId: string, data: any) {
    // Mapeamento dos parâmetros enviados pelo Front e exigidos pelo seu SQL
    const { p_customer_name, p_method, p_items, p_cashier_name, p_cash_session_id } = data;
    const items = p_items || data.items || [];
    const sessionId = p_cash_session_id || data.cashSessionId;

    if (items.length === 0) {
      throw new BadRequestException('A venda não possui itens.');
    }

    if (!sessionId) {
      throw new BadRequestException('Não é possível realizar venda sem um caixa aberto (Sessão ausente).');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        let v_total_amount = 0;
        const processedItems = [];

        for (const item of items) {
          const v_product_id = item.productId || item.id || null;
          const v_inventory_item_id = item.inventoryItemId || item.inventory_item_id || null;
          const v_quantity = Number(item.quantity || 1);
          const v_notes = item.notes || '';

          let v_product_name = 'Produto Desconhecido';
          let v_product_type = 'KITCHEN';
          let v_product_price = 0;
          let v_cost_price = 0;
          let v_final_inventory_id = v_inventory_item_id;

          // Lógica de Busca idêntica à sua função SQL do Supabase
          if (v_product_id) {
            const product = await tx.products.findFirst({
              where: { id: v_product_id, tenant_id: tenantId },
            });
            if (product) {
              v_product_name = product.name;
              v_product_type = product.type;
              v_product_price = Number(product.price || 0);
              v_cost_price = Number(product.cost_price || 0);
              v_final_inventory_id = product.linked_inventory_item_id;
            }
          } 
          
          if (v_product_name === 'Produto Desconhecido' && v_final_inventory_id) {
            const invItem = await tx.inventory_items.findFirst({
              where: { id: v_final_inventory_id, tenant_id: tenantId },
            });
            if (invItem) {
              v_product_name = invItem.name;
              v_product_type = 'RESALE';
              v_product_price = Number((invItem as any).sale_price || 0);
              v_cost_price = Number(invItem.cost_price || 0);
              v_final_inventory_id = invItem.id;
            }
          }

          const v_total_price = v_product_price * v_quantity;
          v_total_amount += v_total_price;

          processedItems.push({
            v_product_id,
            v_final_inventory_id,
            v_quantity,
            v_notes,
            v_product_name,
            v_product_type,
            v_product_price,
            v_cost_price,
            v_total_price
          });
        }

        // 1. Criar o Pedido (Orders)
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
          if (pi.v_final_inventory_id) {
            await tx.inventory_items.update({
              where: { id: pi.v_final_inventory_id },
              data: { quantity: { decrement: pi.v_quantity } },
            });
          }

          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: pi.v_product_id,
              inventory_item_id: pi.v_final_inventory_id,
              quantity: pi.v_quantity,
              notes: pi.v_notes,
              status: 'DELIVERED',
              product_name: pi.v_product_name,
              product_type: pi.v_product_type,
              product_price: pi.v_product_price,
              product_cost_price: pi.v_cost_price,
              unit_price: pi.v_product_price,
              total_price: pi.v_total_price,
            } as any,
          });
        }

        // 3. Registrar Transação Financeira (CORREÇÃO DA VIOLAÇÃO NULA)
        // Usamos "as any" aqui porque seu schema.prisma pode não ter mapeado type/category ainda
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
            type: 'INCOME',    // 👈 Campo obrigatório no seu SQL
            category: 'SALE',  // 👈 Campo obrigatório no seu SQL
          } as any,
        });

        return { success: true, order_id: order.id };
      });
    } catch (error: any) {
      console.error('🚨 Erro Crítico PDV:', error.message);
      throw new BadRequestException(error.message);
    }
  }

  // ==========================================
  // OUTRAS FUNÇÕES (Correção do Build)
  // ==========================================
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    return await this.prisma.$transaction(async (tx) => {
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
      for (const item of items) {
        const pid = item.productId || item.id;
        const product = await tx.products.findFirst({
          where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] }
        });
        if (product) {
          await tx.order_items.create({
            data: {
              tenant_id: tenantId,
              order_id: order.id,
              product_id: product.id,
              quantity: item.quantity,
              product_name: product.name,
              product_price: Number(product.price || 0),
              product_type: product.type,
              status: 'PENDING',
            } as any,
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
    await this.prisma.orders.updateMany({
      where: { id: orderId, tenant_id: tenantId },
      data: { status: 'DISPATCHED', delivery_info: courierInfo || null },
    });
    return { success: true };
  }

  async updateItemStatus(tenantId: string, itemId: string, status: string) {
    await this.prisma.order_items.update({ where: { id: itemId }, data: { status } });
    return { success: true };
  }
}
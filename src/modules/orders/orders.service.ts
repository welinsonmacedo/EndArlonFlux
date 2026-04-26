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
    // 1. Extração de dados compatível com Front (p_items) e SQL (p_customer_name)
    const { p_customer_name, p_method, p_cashier_name } = data;
    const items = data.p_items || data.items || [];
    
    // Captura flexível da sessão de caixa (Obrigatória para o seu financeiro)
    let sessionId = data.p_cash_session_id || data.cashSessionId || data.sessionId;

    if (!items || items.length === 0) {
      throw new BadRequestException('A venda não possui itens.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 🔄 Busca automática de sessão se o Front não enviou (Blindagem)
        if (!sessionId) {
          const activeSession = await tx.cash_sessions.findFirst({
            where: { tenant_id: tenantId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' }
          });
          sessionId = activeSession?.id;
        }

        if (!sessionId) {
          throw new BadRequestException('Venda bloqueada: Não existe sessão de caixa aberta.');
        }

        let v_total_amount = 0;
        const processedItems = [];

        // 2. Loop de processamento de itens (Lógica idêntica à sua função SQL)
        for (const item of items) {
          // O seu front envia 'productId'. Capturamos qualquer variante para não falhar.
          const pid = item.productId || item.id || item.inventoryItemId;
          
          if (!pid) continue; // Pula se o item vier vazio, em vez de quebrar a busca

          // 🛡️ BUSCA CORRIGIDA: Resolve o erro "Argument id is missing" do Prisma
          // Procura o produto por ID próprio OU pelo vínculo de inventário vinculado (insumo)
          const product = await tx.products.findFirst({
            where: { 
              tenant_id: tenantId,
              OR: [
                { id: pid },
                { linked_inventory_item_id: pid }
              ]
            },
          });

          if (!product) {
            throw new NotFoundException(`Produto ou Insumo ${pid} não localizado.`);
          }

          const unitPrice = Number(product.price || 0);
          const qty = Number(item.quantity || 1);
          const totalPrice = unitPrice * qty;
          v_total_amount += totalPrice;

          processedItems.push({
            productId: product.id,
            inventoryId: product.linked_inventory_item_id,
            name: product.name,
            type: product.type || 'KITCHEN',
            price: unitPrice,
            costPrice: Number(product.cost_price || 0),
            qty: qty,
            totalPrice: totalPrice,
            notes: item.notes || ''
          });
        }

        // 3. Criar o Pedido (Orders) - Status DELIVERED e is_paid conforme sua regra
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
            } as any, // as any para suportar os campos unit_price/total_price do seu DB
          });
        }

        // 5. Registrar Transação Financeira (Blindagem contra violação de Nulo)
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
            type: 'INCOME',   // Campo obrigatório (Enum) no seu SQL
            category: 'SALE'  // Campo obrigatório no seu SQL
          } as any,
        });

        return { success: true, order_id: order.id, total: v_total_amount };
      });
    } catch (error: any) {
      console.error('🚨 Erro Crítico no processPosSale:', error);
      throw new BadRequestException(error.message || 'Erro ao processar venda PDV');
    }
  }

  // ==========================================
  // PLACE ORDER (Mesas / QR Code / Delivery)
  // ==========================================
  async placeOrder(tenantId: string, data: any) {
    const { tableId, type, items, deliveryInfo } = data;
    if (!items || items.length === 0) throw new BadRequestException('Pedido sem itens.');

    try {
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
          const pid = item.productId || item.id || item.inventoryItemId;
          if (!pid) continue;

          const product = await tx.products.findFirst({
            where: { 
              tenant_id: tenantId, 
              OR: [{ id: pid }, { linked_inventory_item_id: pid }] 
            }
          });

          if (product) {
            const invId = product.linked_inventory_item_id;
            if (invId) {
              await tx.inventory_items.update({ 
                where: { id: invId }, 
                data: { quantity: { decrement: item.quantity } } 
              });
            }

            await tx.order_items.create({
              data: {
                tenant_id: tenantId,
                order_id: order.id,
                product_id: product.id,
                inventory_item_id: invId || null,
                quantity: item.quantity,
                product_name: product.name,
                product_price: Number(product.price || 0),
                product_type: product.type || 'KITCHEN',
                status: 'PENDING',
              } as any,
            });
          }
        }
        return order;
      });
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  // ==========================================
  // PAYMENT / FINANCEIRO
  // ==========================================
  async processPayment(tenantId: string, data: any) {
    const { p_order_id } = data;
    try {
      await this.prisma.orders.update({
        where: { id: p_order_id },
        data: { is_paid: true, status: 'COMPLETED' },
      });
      return { success: true };
    } catch (error) {
      throw new BadRequestException('Erro ao processar pagamento.');
    }
  }

  // ==========================================
  // CANCELAMENTO (Devolve stock ao inventário)
  // ==========================================
  async cancelOrder(tenantId: string, orderId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const items = await tx.order_items.findMany({
          where: { order_id: orderId, tenant_id: tenantId },
        });

        for (const item of items) {
          if (item.inventory_item_id) {
            await tx.inventory_items.update({
              where: { id: item.inventory_item_id },
              data: { quantity: { increment: item.quantity } },
            });
          }
        }

        await tx.orders.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' },
        });

        return { success: true };
      });
    } catch (error: any) {
      throw new BadRequestException('Erro ao cancelar pedido.');
    }
  }

  // ==========================================
  // STATUS E DISPATCH
  // ==========================================
  async dispatchOrder(tenantId: string, orderId: string, courierInfo: any) {
    await this.prisma.orders.updateMany({
      where: { id: orderId, tenant_id: tenantId },
      data: { 
        status: 'DISPATCHED', 
        delivery_info: courierInfo || null 
      },
    });
    return { success: true };
  }

  async updateItemStatus(tenantId: string, itemId: string, status: string) {
    await this.prisma.order_items.update({
      where: { id: itemId },
      data: { status },
    });
    return { success: true };
  }
}
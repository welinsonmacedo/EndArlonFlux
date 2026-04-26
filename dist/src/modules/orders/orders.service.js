"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let OrdersService = class OrdersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async processPosSale(tenantId, data) {
        const { p_customer_name, p_method, p_items, p_cashier_name } = data;
        const items = p_items || data.items || [];
        let sessionId = data.p_cash_session_id || data.cashSessionId || data.cash_session_id || data.sessionId;
        if (items.length === 0) {
            throw new common_1.BadRequestException('A venda não possui itens.');
        }
        try {
            return await this.prisma.$transaction(async (tx) => {
                if (!sessionId) {
                    const activeSession = await tx.cash_sessions.findFirst({
                        where: { tenant_id: tenantId, status: 'OPEN' },
                        orderBy: { opened_at: 'desc' }
                    });
                    sessionId = activeSession?.id;
                }
                if (!sessionId) {
                    throw new common_1.BadRequestException('Nenhuma sessão de caixa aberta encontrada para processar a venda.');
                }
                let v_total_amount = 0;
                const processedItems = [];
                for (const item of items) {
                    const pid = item.productId || item.id || null;
                    const qty = Number(item.quantity || 1);
                    const product = await tx.products.findFirst({
                        where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] },
                    });
                    if (!product)
                        throw new common_1.NotFoundException(`Produto ${pid} não encontrado.`);
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
                        },
                    });
                }
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
                    },
                });
                return { success: true, order_id: order.id };
            });
        }
        catch (error) {
            console.error('🚨 Erro Crítico PDV:', error);
            throw new common_1.BadRequestException(error.message);
        }
    }
    async placeOrder(tenantId, data) {
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
                        data: { tenant_id: tenantId, order_id: order.id, product_id: product.id, quantity: item.quantity, product_name: product.name, product_price: Number(product.price || 0), product_type: product.type, status: 'PENDING' }
                    });
                }
            }
            return order;
        });
    }
    async processPayment(tenantId, data) {
        const { p_order_id } = data;
        await this.prisma.orders.update({ where: { id: p_order_id }, data: { is_paid: true, status: 'COMPLETED' } });
        return { success: true };
    }
    async cancelOrder(tenantId, orderId) {
        await this.prisma.orders.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
        return { success: true };
    }
    async dispatchOrder(tenantId, orderId, courierInfo) {
        await this.prisma.orders.updateMany({ where: { id: orderId, tenant_id: tenantId }, data: { status: 'DISPATCHED', delivery_info: courierInfo || null } });
        return { success: true };
    }
    async updateItemStatus(tenantId, itemId, status) {
        await this.prisma.order_items.update({ where: { id: itemId }, data: { status } });
        return { success: true };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map
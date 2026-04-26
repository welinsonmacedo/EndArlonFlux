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
        const customerName = data.p_customer_name || data.customerName || 'Consumidor Final';
        const paymentMethod = data.p_method || data.method || 'DINHEIRO';
        const cashierName = data.p_cashier_name || data.cashierName || 'Sistema';
        const items = data.p_items || data.items || [];
        let sessionId = data.p_cash_session_id || data.cashSessionId || data.sessionId;
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
                    throw new common_1.BadRequestException('Venda bloqueada: Não existe sessão de caixa aberta para este restaurante.');
                }
                let v_total_amount = 0;
                const processedItems = [];
                for (const item of items) {
                    const pid = item.productId || item.id || item.inventoryItemId;
                    if (!pid)
                        continue;
                    const product = await tx.products.findFirst({
                        where: {
                            tenant_id: tenantId,
                            OR: [{ id: pid }, { linked_inventory_item_id: pid }]
                        },
                    });
                    let itemData;
                    if (product) {
                        itemData = {
                            name: product.name,
                            type: product.type || 'KITCHEN',
                            price: Number(product.price || 0),
                            costPrice: Number(product.cost_price || 0),
                            inventoryId: product.linked_inventory_item_id,
                            productId: product.id
                        };
                    }
                    else {
                        const invItem = await tx.inventory_items.findFirst({
                            where: { id: pid, tenant_id: tenantId }
                        });
                        if (!invItem)
                            throw new common_1.NotFoundException(`Item ${pid} não localizado.`);
                        itemData = {
                            name: invItem.name,
                            type: 'RESALE',
                            price: Number(invItem.sale_price || 0),
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
                const order = await tx.orders.create({
                    data: {
                        tenant_id: tenantId,
                        status: 'DELIVERED',
                        is_paid: true,
                        customer_name: customerName,
                        order_type: 'PDV',
                        total_amount: v_total_amount,
                    },
                });
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
                        },
                    });
                }
                await tx.transactions.create({
                    data: {
                        tenant_id: tenantId,
                        order_id: order.id,
                        cash_session_id: sessionId,
                        amount: v_total_amount,
                        method: paymentMethod,
                        items_summary: 'Venda Balcão (PDV)',
                        status: 'COMPLETED',
                        cashier_name: cashierName,
                    },
                });
                return { success: true, order_id: order.id, total: v_total_amount };
            });
        }
        catch (error) {
            console.error('🚨 Erro PDV:', error.message);
            throw new common_1.BadRequestException(error.message || 'Erro interno na venda');
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
                    const invId = product.linked_inventory_item_id;
                    if (invId)
                        await tx.inventory_items.update({ where: { id: invId }, data: { quantity: { decrement: item.quantity } } });
                    await tx.order_items.create({
                        data: { tenant_id: tenantId, order_id: order.id, product_id: product.id, quantity: item.quantity, product_name: product.name, product_price: Number(product.price || 0), product_type: product.type || 'KITCHEN', status: 'PENDING' }
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
        try {
            return await this.prisma.$transaction(async (tx) => {
                const items = await tx.order_items.findMany({ where: { order_id: orderId, tenant_id: tenantId } });
                for (const item of items) {
                    if (item.inventory_item_id)
                        await tx.inventory_items.update({ where: { id: item.inventory_item_id }, data: { quantity: { increment: item.quantity } } });
                }
                await tx.orders.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
                return { success: true };
            });
        }
        catch (error) {
            throw new common_1.BadRequestException('Erro ao cancelar pedido.');
        }
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
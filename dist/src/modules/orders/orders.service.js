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
                    throw new common_1.BadRequestException('ERRO: Não existe caixa aberto para este restaurante.');
                }
                let totalAmount = 0;
                const itemsToCreate = [];
                for (const item of items) {
                    const pid = item.productId || item.id || item.inventoryItemId;
                    if (!pid)
                        continue;
                    const product = await tx.products.findFirst({
                        where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] },
                    });
                    let pInfo;
                    if (product) {
                        pInfo = {
                            id: product.id,
                            name: product.name,
                            price: Number(product.price || 0),
                            type: product.type || 'KITCHEN',
                            cost: Number(product.cost_price || 0),
                            invId: product.linked_inventory_item_id
                        };
                    }
                    else {
                        const inv = await tx.inventory_items.findFirst({ where: { id: pid, tenant_id: tenantId } });
                        if (!inv)
                            throw new common_1.NotFoundException(`Item ${pid} não localizado.`);
                        pInfo = {
                            id: null,
                            name: inv.name,
                            price: Number(inv.sale_price || 0),
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
                        },
                    });
                }
                const transactionData = {
                    tenant_id: tenantId,
                    order_id: order.id,
                    cash_session_id: sessionId,
                    amount: totalAmount,
                    method: String(paymentMethod),
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
        }
        catch (error) {
            console.error('🚨 ERRO FATAL PDV:', error);
            throw new common_1.BadRequestException(error.message || 'Erro interno no servidor');
        }
    }
    async placeOrder(tenantId, data) {
        const { tableId, type, items, deliveryInfo } = data;
        return await this.prisma.$transaction(async (tx) => {
            const order = await tx.orders.create({ data: { tenant_id: tenantId, table_id: tableId || null, order_type: type || 'DINE_IN', status: 'PENDING', is_paid: false, delivery_info: deliveryInfo || null } });
            for (const item of items) {
                const pid = item.productId || item.id;
                if (!pid)
                    continue;
                const product = await tx.products.findFirst({ where: { tenant_id: tenantId, OR: [{ id: pid }, { linked_inventory_item_id: pid }] } });
                if (product) {
                    await tx.order_items.create({ data: { tenant_id: tenantId, order_id: order.id, product_id: product.id, quantity: item.quantity, product_name: product.name, product_price: Number(product.price || 0), product_type: product.type || 'KITCHEN', status: 'PENDING' } });
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
        const items = await this.prisma.order_items.findMany({ where: { order_id: orderId, tenant_id: tenantId } });
        for (const item of items) {
            if (item.inventory_item_id)
                await this.prisma.inventory_items.update({ where: { id: item.inventory_item_id }, data: { quantity: { increment: item.quantity } } });
        }
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
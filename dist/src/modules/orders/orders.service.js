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
    validateItems(items) {
        if (!items || items.length === 0) {
            throw new common_1.BadRequestException('O pedido precisa ter itens.');
        }
    }
    validatePaymentInput(tableId, orderId) {
        if (!tableId && !orderId) {
            throw new common_1.BadRequestException('Informe tableId ou orderId');
        }
        if (tableId && orderId) {
            throw new common_1.BadRequestException('Não envie tableId e orderId juntos');
        }
    }
    async placeOrder(tenantId, data) {
        const { tableId, type, items, deliveryInfo } = data;
        this.validateItems(items);
        try {
            const result = await this.prisma.$transaction(async (tx) => {
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
                    if (item.inventoryItemId) {
                        const inventory = await tx.inventory_items.findUnique({
                            where: { id: item.inventoryItemId },
                        });
                        if (!inventory)
                            throw new common_1.NotFoundException(`Item de estoque não encontrado: ${item.name}`);
                        if (inventory.quantity < item.quantity) {
                            throw new common_1.BadRequestException(`Estoque insuficiente para ${item.name}`);
                        }
                        await tx.inventory_items.update({
                            where: { id: item.inventoryItemId },
                            data: { quantity: { decrement: item.quantity } },
                        });
                    }
                    await tx.order_items.create({
                        data: {
                            tenant_id: tenantId,
                            order_id: order.id,
                            product_id: item.productId || null,
                            inventory_item_id: item.inventoryItemId || null,
                            quantity: item.quantity,
                            product_name: item.name || 'Produto',
                            product_price: Number(item.salePrice) || 0,
                            notes: item.notes || null,
                            status: 'PENDING',
                            product_type: item.type || 'KITCHEN',
                        },
                    });
                }
                return order;
            });
            return { success: true, order: result };
        }
        catch (error) {
            console.error('Erro no placeOrder:', error);
            throw new common_1.BadRequestException(error.message || 'Erro ao criar pedido');
        }
    }
    async processPosSale(tenantId, data) {
        const { customerName, method, items, cashierName } = data;
        this.validateItems(items);
        const totalAmount = items.reduce((acc, item) => {
            return acc + (Number(item.salePrice) || 0) * (Number(item.quantity) || 1);
        }, 0);
        try {
            return await this.prisma.$transaction(async (tx) => {
                const order = await tx.orders.create({
                    data: {
                        tenant_id: tenantId,
                        order_type: 'PDV',
                        status: 'COMPLETED',
                        is_paid: true,
                        customer_name: customerName || null,
                        total_amount: totalAmount,
                    },
                });
                for (const item of items) {
                    if (item.inventoryItemId) {
                        await tx.inventory_items.update({
                            where: { id: item.inventoryItemId },
                            data: { quantity: { decrement: Number(item.quantity) || 1 } },
                        });
                    }
                    await tx.order_items.create({
                        data: {
                            tenant_id: tenantId,
                            order_id: order.id,
                            product_id: item.productId || null,
                            inventory_item_id: item.inventoryItemId || null,
                            quantity: Number(item.quantity) || 1,
                            notes: item.notes || null,
                            status: 'COMPLETED',
                            product_name: item.name || 'Produto',
                            product_price: Number(item.salePrice) || 0,
                            product_type: item.type || 'PVD',
                        },
                    });
                }
                await tx.transactions.create({
                    data: {
                        tenant_id: tenantId,
                        order_id: order.id,
                        amount: totalAmount,
                        method: method || 'DINHEIRO',
                        cashier_name: cashierName || 'Sistema',
                        status: 'COMPLETED',
                    },
                });
                return { success: true, orderId: order.id };
            });
        }
        catch (error) {
            console.error('Erro no processPosSale:', error);
            throw new common_1.BadRequestException(error.message || 'Erro ao processar venda PDV');
        }
    }
    async processPayment(tenantId, data) {
        const { tableId, orderId, amount, cashierName, method } = data;
        this.validatePaymentInput(tableId, orderId);
        try {
            return await this.prisma.$transaction(async (tx) => {
                if (tableId) {
                    await tx.orders.updateMany({
                        where: { tenant_id: tenantId, table_id: tableId, is_paid: false },
                        data: { is_paid: true, status: 'COMPLETED' },
                    });
                    await tx.restaurant_tables.update({
                        where: { id: tableId },
                        data: { status: 'AVAILABLE', customer_name: null, access_code: null },
                    });
                }
                if (orderId) {
                    const result = await tx.orders.updateMany({
                        where: { id: orderId, tenant_id: tenantId },
                        data: { is_paid: true, status: 'COMPLETED' },
                    });
                    if (result.count === 0)
                        throw new common_1.NotFoundException('Pedido não encontrado');
                }
                await tx.transactions.create({
                    data: {
                        tenant_id: tenantId,
                        table_id: tableId || null,
                        order_id: orderId || null,
                        amount: Number(amount) || 0,
                        method: method || 'DINHEIRO',
                        cashier_name: cashierName || 'Sistema',
                        status: 'COMPLETED',
                    },
                });
                return { success: true };
            });
        }
        catch (error) {
            console.error('Erro no processPayment:', error);
            throw new common_1.BadRequestException(error.message || 'Erro no pagamento');
        }
    }
    async cancelOrder(tenantId, orderId) {
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
                const result = await tx.orders.updateMany({
                    where: { id: orderId, tenant_id: tenantId },
                    data: { deleted_at: new Date(), status: 'CANCELLED' },
                });
                if (result.count === 0)
                    throw new common_1.NotFoundException('Pedido não encontrado');
                return { success: true };
            });
        }
        catch (error) {
            console.error('Erro no cancelOrder:', error);
            throw new common_1.BadRequestException(error.message || 'Erro ao cancelar pedido');
        }
    }
    async dispatchOrder(tenantId, orderId, courierInfo) {
        const result = await this.prisma.orders.updateMany({
            where: { id: orderId, tenant_id: tenantId },
            data: { status: 'DISPATCHED', delivery_info: courierInfo || null },
        });
        if (result.count === 0)
            throw new common_1.NotFoundException('Pedido não encontrado');
        return { success: true };
    }
    async updateItemStatus(tenantId, itemId, status) {
        const result = await this.prisma.order_items.updateMany({
            where: { id: itemId, tenant_id: tenantId },
            data: { status },
        });
        if (result.count === 0)
            throw new common_1.NotFoundException('Item não encontrado');
        return { success: true };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map
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
    async placeOrder(tenantId, data) {
        const { tableId, type, items, deliveryInfo } = data;
        if (!items || items.length === 0) {
            throw new common_1.BadRequestException('O pedido tem de conter itens.');
        }
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const order = await tx.orders.create({
                    data: {
                        tenant_id: tenantId,
                        table_id: tableId || null,
                        type: type || 'DINE_IN',
                        status: 'PENDING',
                        is_paid: false,
                        delivery_info: deliveryInfo ? deliveryInfo : null,
                    },
                });
                for (const item of items) {
                    await tx.order_items.create({
                        data: {
                            tenant_id: tenantId,
                            order_id: order.id,
                            product_id: item.productId || null,
                            inventory_item_id: item.inventoryItemId || null,
                            quantity: item.quantity,
                            product_name: item.name || 'Produto',
                            product_price: item.salePrice || 0,
                            notes: item.notes || null,
                            status: 'PENDING',
                            product_type: item.type || 'KITCHEN',
                        },
                    });
                    if (item.inventoryItemId) {
                        await tx.inventory_items.update({
                            where: { id: item.inventoryItemId },
                            data: {
                                quantity: {
                                    decrement: item.quantity,
                                },
                            },
                        });
                    }
                }
                return order;
            });
            return { success: true, order: result };
        }
        catch (error) {
            console.error('Erro ao processar pedido:', error);
            throw new common_1.BadRequestException('Falha ao registar o pedido e processar estoque.');
        }
    }
    async processPosSale(tenantId, data) {
        const { customerName, method, items, cashierName } = data;
        if (!items || items.length === 0) {
            throw new common_1.BadRequestException('A venda do PDV tem de conter itens.');
        }
        try {
            return await this.prisma.$transaction(async (tx) => {
                const order = await tx.orders.create({
                    data: {
                        tenant_id: tenantId,
                        type: 'PDV',
                        status: 'COMPLETED',
                        is_paid: true,
                    },
                });
                for (const item of items) {
                    await tx.order_items.create({
                        data: {
                            tenant_id: tenantId,
                            order_id: order.id,
                            product_id: item.productId || null,
                            inventory_item_id: item.inventoryItemId || null,
                            quantity: item.quantity,
                            notes: item.notes || null,
                            status: 'COMPLETED',
                            product_type: item.type || 'KITCHEN',
                            product_name: item.name || 'Produto Balcão',
                            product_price: item.salePrice || 0,
                        },
                    });
                    if (item.inventoryItemId) {
                        await tx.inventory_items.update({
                            where: { id: item.inventoryItemId },
                            data: { quantity: { decrement: item.quantity } },
                        });
                    }
                }
                return { success: true, order };
            });
        }
        catch (error) {
            console.error('Erro ao processar venda no PDV:', error);
            throw new common_1.BadRequestException('Falha ao registar a venda no PDV.');
        }
    }
    async processPayment(tenantId, data) {
        const { tableId, amount, method, cashierName, orderId, specificOrderIds } = data;
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
                else if (orderId) {
                    await tx.orders.update({
                        where: { id: orderId },
                        data: { is_paid: true, status: 'COMPLETED' },
                    });
                }
                return { success: true, message: 'Pagamento registado com sucesso' };
            });
        }
        catch (error) {
            console.error('Erro ao processar pagamento:', error);
            throw new common_1.BadRequestException('Falha ao processar o pagamento.');
        }
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map
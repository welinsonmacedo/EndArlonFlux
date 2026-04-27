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
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let InventoryService = class InventoryService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createInventoryItem(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const item = await tx.inventory_items.create({
                data: {
                    tenant_id: tenantId,
                    name: data.name,
                    barcode: data.barcode || null,
                    unit: data.unit || 'UN',
                    quantity: data.quantity || 0,
                    min_quantity: data.minQuantity || 5,
                    cost_price: data.costPrice || 0,
                    sale_price: data.salePrice || 0,
                    type: data.type || 'INGREDIENT',
                    category: data.category || null,
                    description: data.description || null,
                    image: data.image || null,
                    is_extra: data.isExtra || false,
                    target_categories: data.targetCategories || [],
                }
            });
            if (data.recipe && data.recipe.length > 0) {
                for (const r of data.recipe) {
                    await tx.inventory_recipes.create({
                        data: {
                            tenant_id: tenantId,
                            parent_item_id: item.id,
                            ingredient_item_id: r.ingredientId,
                            quantity: r.quantity,
                        }
                    });
                }
            }
            return { success: true, id: item.id };
        });
    }
    async updateInventoryItem(tenantId, authUserId, itemId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const item = await tx.inventory_items.findUnique({ where: { id: itemId } });
            if (!item)
                throw new common_1.NotFoundException('Item não encontrado.');
            await tx.inventory_items.update({
                where: { id: itemId },
                data: {
                    name: data.name,
                    barcode: data.barcode,
                    unit: data.unit,
                    min_quantity: data.minQuantity,
                    cost_price: data.costPrice,
                    sale_price: data.salePrice,
                    type: data.type,
                    category: data.category,
                    description: data.description,
                    image: data.image,
                    is_extra: data.isExtra,
                    target_categories: data.targetCategories,
                }
            });
            if (data.recipe) {
                await tx.inventory_recipes.deleteMany({ where: { parent_item_id: itemId } });
                for (const r of data.recipe) {
                    await tx.inventory_recipes.create({
                        data: {
                            tenant_id: tenantId,
                            parent_item_id: itemId,
                            ingredient_item_id: r.ingredientId,
                            quantity: r.quantity,
                        }
                    });
                }
            }
            return { success: true };
        });
    }
    async deleteInventoryItem(tenantId, authUserId, itemId) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            await tx.inventory_items.update({
                where: { id: itemId },
                data: { deleted_at: new Date() }
            });
            await tx.products.updateMany({
                where: { linked_inventory_item_id: itemId, is_extra: true },
                data: { deleted_at: new Date() }
            });
            return { success: true };
        });
    }
    async adjustStock(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            await tx.inventory_items.update({
                where: { id: data.itemId },
                data: {
                    quantity: data.type === 'IN' ? { increment: data.quantity } : { decrement: data.quantity },
                }
            });
            await tx.inventory_logs.create({
                data: {
                    tenant_id: tenantId,
                    item_id: data.itemId,
                    type: data.type,
                    quantity: data.quantity,
                    reason: data.reason,
                    user_name: data.userName,
                    user_id: authUserId !== tenantId ? authUserId : null,
                }
            });
            return { success: true };
        });
    }
    async processInventoryAdjustment(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            for (const adj of data.adjustments) {
                const item = await tx.inventory_items.findUnique({ where: { id: adj.itemId } });
                if (!item)
                    continue;
                const currentQty = Number(item.quantity || 0);
                if (currentQty === adj.realQty)
                    continue;
                const diff = Math.abs(currentQty - adj.realQty);
                const type = adj.realQty > currentQty ? 'IN' : 'OUT';
                await tx.inventory_items.update({
                    where: { id: adj.itemId },
                    data: { quantity: adj.realQty }
                });
                await tx.inventory_logs.create({
                    data: {
                        tenant_id: tenantId,
                        item_id: adj.itemId,
                        type: type,
                        quantity: diff,
                        reason: 'Balanço de Estoque',
                        user_name: data.userName,
                        user_id: authUserId !== tenantId ? authUserId : null,
                    }
                });
            }
            return { success: true };
        });
    }
    async processPurchase(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const pd = data.purchaseData;
            const po = await tx.purchase_orders.create({
                data: {
                    tenant_id: tenantId,
                    supplier_id: pd.supplierId || null,
                    total_cost: pd.totalCost,
                    status: 'COMPLETED',
                    created_by: authUserId !== tenantId ? authUserId : null,
                }
            });
            for (const item of pd.items) {
                await tx.purchase_order_items.create({
                    data: {
                        tenant_id: tenantId,
                        purchase_order_id: po.id,
                        inventory_item_id: item.itemId,
                        quantity: item.quantity,
                        unit_cost: item.unitCost,
                    }
                });
                await tx.inventory_items.update({
                    where: { id: item.itemId },
                    data: { quantity: { increment: item.quantity } }
                });
                await tx.inventory_logs.create({
                    data: {
                        tenant_id: tenantId,
                        item_id: item.itemId,
                        type: 'IN',
                        quantity: item.quantity,
                        reason: `Compra #${po.id.substring(0, 8)}`,
                        user_name: 'Sistema',
                        user_id: authUserId !== tenantId ? authUserId : null,
                    }
                });
            }
            if (pd.createExpense) {
                await tx.expenses.create({
                    data: {
                        tenant_id: tenantId,
                        description: `Compra de Estoque #${po.id.substring(0, 8)}`,
                        amount: pd.totalCost,
                        category: 'Estoque',
                        due_date: new Date(pd.dueDate || new Date()),
                        is_paid: pd.isPaid || false,
                        supplier_id: pd.supplierId || null,
                        payment_method: pd.paymentMethod || null,
                    }
                });
            }
            return { success: true, purchaseOrderId: po.id };
        });
    }
    async createSupplier(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const supplier = await tx.suppliers.create({
                data: {
                    tenant_id: tenantId,
                    name: data.name,
                    contact_name: data.contact_name || data.contactName,
                    phone: data.phone,
                    email: data.email,
                    cnpj: data.cnpj,
                    ie: data.ie,
                    cep: data.cep,
                    address: data.address,
                    number: data.number,
                    complement: data.complement,
                    city: data.city,
                    state: data.state,
                }
            });
            return { success: true, supplier };
        });
    }
    async updateSupplier(tenantId, authUserId, id, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const supplier = await tx.suppliers.update({
                where: { id },
                data: {
                    name: data.name,
                    contact_name: data.contact_name || data.contactName,
                    phone: data.phone,
                    email: data.email,
                    cnpj: data.cnpj,
                    ie: data.ie,
                    cep: data.cep,
                    address: data.address,
                    number: data.number,
                    complement: data.complement,
                    city: data.city,
                    state: data.state,
                }
            });
            return { success: true, supplier };
        });
    }
    async deleteSupplier(tenantId, authUserId, id) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            await tx.suppliers.delete({ where: { id } });
            return { success: true };
        });
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map
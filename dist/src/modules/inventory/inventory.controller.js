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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const inventory_service_1 = require("./inventory.service");
const supabase_guard_1 = require("../../core/auth/supabase.guard");
let InventoryController = class InventoryController {
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    extractIds(req, body) {
        const tenantId = body?.tenantId || req.query?.tenantId || req.headers['x-tenant-id'] || req.user?.user_metadata?.tenant_id;
        const authUserId = req.user?.id || req.user?.sub;
        if (!tenantId)
            throw new common_1.BadRequestException('tenantId ausente.');
        return { tenantId, authUserId };
    }
    async createItem(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.createInventoryItem(tenantId, authUserId, data);
    }
    async updateItem(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.updateInventoryItem(tenantId, authUserId, id, data);
    }
    async deleteItem(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.deleteInventoryItem(tenantId, authUserId, id);
    }
    async adjustStock(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.adjustStock(tenantId, authUserId, data);
    }
    async processAdjustments(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.processInventoryAdjustment(tenantId, authUserId, data);
    }
    async processPurchase(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.processPurchase(tenantId, authUserId, data);
    }
    async createSupplier(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.createSupplier(tenantId, authUserId, data);
    }
    async updateSupplier(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.updateSupplier(tenantId, authUserId, id, data);
    }
    async deleteSupplier(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.inventoryService.deleteSupplier(tenantId, authUserId, id);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Post)('items'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "createItem", null);
__decorate([
    (0, common_1.Patch)('items/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Delete)('items/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "deleteItem", null);
__decorate([
    (0, common_1.Post)('stock/adjust'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "adjustStock", null);
__decorate([
    (0, common_1.Post)('stock/process-adjustments'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "processAdjustments", null);
__decorate([
    (0, common_1.Post)('purchases'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "processPurchase", null);
__decorate([
    (0, common_1.Post)('suppliers'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "createSupplier", null);
__decorate([
    (0, common_1.Patch)('suppliers/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "updateSupplier", null);
__decorate([
    (0, common_1.Delete)('suppliers/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "deleteSupplier", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)('api/inventory'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map
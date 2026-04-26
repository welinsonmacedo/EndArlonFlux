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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const orders_service_1 = require("./orders.service");
const supabase_guard_1 = require("../../core/auth/supabase.guard");
let OrdersController = class OrdersController {
    constructor(ordersService) {
        this.ordersService = ordersService;
    }
    validateTenant(tenantId) {
        if (!tenantId) {
            throw new common_1.BadRequestException('Tenant ID é obrigatório');
        }
    }
    async placeOrder(tenantId, body) {
        this.validateTenant(tenantId);
        return this.ordersService.placeOrder(tenantId, body);
    }
    async processPosSale(tenantId, body) {
        this.validateTenant(tenantId);
        return this.ordersService.processPosSale(tenantId, body);
    }
    async processPayment(tenantId, body) {
        this.validateTenant(tenantId);
        return this.ordersService.processPayment(tenantId, body);
    }
    async cancelOrder(tenantId, orderId) {
        this.validateTenant(tenantId);
        return this.ordersService.cancelOrder(tenantId, orderId);
    }
    async dispatchOrder(tenantId, orderId, courierInfo) {
        this.validateTenant(tenantId);
        return this.ordersService.dispatchOrder(tenantId, orderId, courierInfo);
    }
    async updateItemStatus(tenantId, itemId, status) {
        this.validateTenant(tenantId);
        return this.ordersService.updateItemStatus(tenantId, itemId, status);
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Post)('place'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Headers)('x-tenant-id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "placeOrder", null);
__decorate([
    (0, common_1.Post)('pos-sale'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Headers)('x-tenant-id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "processPosSale", null);
__decorate([
    (0, common_1.Post)('payment'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Headers)('x-tenant-id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "processPayment", null);
__decorate([
    (0, common_1.Patch)(':id/cancel'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    __param(0, (0, common_1.Headers)('x-tenant-id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "cancelOrder", null);
__decorate([
    (0, common_1.Patch)(':id/dispatch'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    __param(0, (0, common_1.Headers)('x-tenant-id')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('courierInfo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "dispatchOrder", null);
__decorate([
    (0, common_1.Patch)('items/:itemId/status'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    __param(0, (0, common_1.Headers)('x-tenant-id')),
    __param(1, (0, common_1.Param)('itemId')),
    __param(2, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updateItemStatus", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)('api/orders'),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map
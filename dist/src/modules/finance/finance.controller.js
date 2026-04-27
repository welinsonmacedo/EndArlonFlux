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
exports.FinanceController = void 0;
const common_1 = require("@nestjs/common");
const finance_service_1 = require("./finance.service");
const supabase_guard_1 = require("../../core/auth/supabase.guard");
let FinanceController = class FinanceController {
    constructor(financeService) {
        this.financeService = financeService;
    }
    extractIds(req, body) {
        const tenantId = body?.tenantId || req.query?.tenantId || req.headers['x-tenant-id'] || req.user?.user_metadata?.tenant_id;
        const authUserId = req.user?.id;
        if (!tenantId)
            throw new common_1.BadRequestException('tenantId ausente.');
        return { tenantId, authUserId };
    }
    async open(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.openSession(tenantId, authUserId, data);
    }
    async close(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.closeSession(tenantId, authUserId, id, data);
    }
    async movement(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.registerMovement(tenantId, authUserId, data);
    }
    async createExpense(req, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.createExpense(tenantId, authUserId, data);
    }
    async updateExpense(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.updateExpense(tenantId, authUserId, id, data);
    }
    async pay(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.payExpense(tenantId, authUserId, id, data);
    }
    async deleteExpense(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.deleteExpense(tenantId, authUserId, id, data);
    }
    async voidTransaction(req, id, data) {
        const { tenantId, authUserId } = this.extractIds(req, data);
        return this.financeService.voidTransaction(tenantId, authUserId, id, data);
    }
    async getSummary(req, start, end, tId) {
        return this.financeService.getDashboardSummary(tId, new Date(start), new Date(end));
    }
};
exports.FinanceController = FinanceController;
__decorate([
    (0, common_1.Post)('cashier/open'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "open", null);
__decorate([
    (0, common_1.Post)('cashier/close/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "close", null);
__decorate([
    (0, common_1.Post)('cashier/movement'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "movement", null);
__decorate([
    (0, common_1.Post)('expenses'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "createExpense", null);
__decorate([
    (0, common_1.Patch)('expenses/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "updateExpense", null);
__decorate([
    (0, common_1.Patch)('expenses/:id/pay'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "pay", null);
__decorate([
    (0, common_1.Delete)('expenses/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "deleteExpense", null);
__decorate([
    (0, common_1.Post)('transactions/:id/cancel'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "voidTransaction", null);
__decorate([
    (0, common_1.Get)('summary'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('start')),
    __param(2, (0, common_1.Query)('end')),
    __param(3, (0, common_1.Query)('tenantId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "getSummary", null);
exports.FinanceController = FinanceController = __decorate([
    (0, common_1.Controller)('api/finance'),
    (0, common_1.UseGuards)(supabase_guard_1.SupabaseGuard),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinanceController);
//# sourceMappingURL=finance.controller.js.map
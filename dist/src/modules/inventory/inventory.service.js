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
exports.FinanceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let FinanceService = class FinanceService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async openSession(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const active = await tx.cash_sessions.findFirst({
                where: { tenant_id: tenantId, status: 'OPEN' }
            });
            if (active)
                throw new common_1.BadRequestException('Já existe um caixa aberto.');
            return await tx.cash_sessions.create({
                data: {
                    tenant_id: tenantId,
                    initial_amount: data.initialAmount,
                    operator_name: data.operatorName,
                    notes: data.notes,
                    status: 'OPEN',
                    opened_at: new Date()
                }
            });
        });
    }
    async closeSession(tenantId, authUserId, sessionId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const session = await tx.cash_sessions.findUnique({ where: { id: sessionId } });
            if (!session || session.status === 'CLOSED')
                throw new common_1.NotFoundException('Sessão inválida ou já fechada.');
            const totals = await this.calculateSessionTotals(tx, sessionId);
            return await tx.cash_sessions.update({
                where: { id: sessionId },
                data: {
                    final_amount: data.finalAmount,
                    status: 'CLOSED',
                    closed_at: new Date(),
                    notes: `${data.notes || ''} | Esperado em Dinheiro: ${totals.cashExpected}`
                }
            });
        });
    }
    async registerMovement(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            return await tx.cash_movements.create({
                data: {
                    tenant_id: tenantId,
                    session_id: data.sessionId,
                    type: data.type,
                    amount: data.amount,
                    reason: data.reason,
                    user_name: data.userName
                }
            });
        });
    }
    async createExpense(tenantId, authUserId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            return await tx.expenses.create({
                data: {
                    tenant_id: tenantId,
                    description: data.description,
                    amount: data.amount,
                    category: data.category || 'Geral',
                    due_date: new Date(data.dueDate),
                    is_paid: data.isPaid || false,
                    supplier_id: data.supplierId,
                    payment_method: data.paymentMethod
                }
            });
        });
    }
    async payExpense(tenantId, authUserId, expenseId, data) {
        return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
            const expense = await tx.expenses.findUnique({ where: { id: expenseId } });
            if (!expense)
                throw new common_1.NotFoundException('Despesa não encontrada.');
            const updated = await tx.expenses.update({
                where: { id: expenseId },
                data: { is_paid: true, paid_date: new Date(), payment_method: data.paymentMethod }
            });
            if (data.paymentMethod === 'DINHEIRO' && data.sessionId) {
                await tx.cash_movements.create({
                    data: {
                        tenant_id: tenantId,
                        session_id: data.sessionId,
                        type: 'OUT',
                        amount: expense.amount,
                        reason: `Pagamento Despesa: ${expense.description}`,
                        user_name: 'Sistema'
                    }
                });
            }
            return updated;
        });
    }
    async calculateSessionTotals(tx, sessionId) {
        const transactions = await tx.transactions.findMany({ where: { cash_session_id: sessionId } });
        const movements = await tx.cash_movements.findMany({ where: { session_id: sessionId } });
        const salesCash = transactions
            .filter((t) => t.method === 'DINHEIRO')
            .reduce((acc, t) => acc + Number(t.amount), 0);
        const netMovements = movements.reduce((acc, m) => {
            return m.type === 'IN' ? acc + Number(m.amount) : acc - Number(m.amount);
        }, 0);
        const session = await tx.cash_sessions.findUnique({ where: { id: sessionId } });
        const cashExpected = Number(session.initial_amount) + salesCash + netMovements;
        return { cashExpected };
    }
    async getDashboardSummary(tenantId, startDate, endDate) {
        const sales = await this.prisma.transactions.aggregate({
            where: { tenant_id: tenantId, created_at: { gte: startDate, lte: endDate }, status: 'COMPLETED' },
            _sum: { amount: true }
        });
        const expenses = await this.prisma.expenses.aggregate({
            where: { tenant_id: tenantId, due_date: { gte: startDate, lte: endDate }, is_paid: true },
            _sum: { amount: true }
        });
        return {
            totalRevenue: sales._sum.amount || 0,
            totalExpenses: expenses._sum.amount || 0,
            netProfit: Number(sales._sum.amount || 0) - Number(expenses._sum.amount || 0)
        };
    }
};
exports.FinanceService = FinanceService;
exports.FinanceService = FinanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FinanceService);
//# sourceMappingURL=inventory.service.js.map
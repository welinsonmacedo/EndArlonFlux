import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // GESTÃO DE SESSÕES DE CAIXA
  // ==========================================

  async openSession(tenantId: string, authUserId: string, data: { initialAmount: number; operatorName: string; notes?: string }) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      const active = await tx.cash_sessions.findFirst({
        where: { tenant_id: tenantId, status: 'OPEN' }
      });

      if (active) throw new BadRequestException('Já existe um caixa aberto para este restaurante.');

      return await tx.cash_sessions.create({
        data: {
          tenant_id: tenantId,
          initial_amount: data.initialAmount || 0,
          operator_name: data.operatorName,
          notes: data.notes || '',
          status: 'OPEN',
          opened_at: new Date()
        } as any
      });
    });
  }

  async closeSession(tenantId: string, authUserId: string, sessionId: string, data: { finalAmount: number; notes?: string }) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      const session = await tx.cash_sessions.findUnique({ where: { id: sessionId } });
      if (!session || session.status === 'CLOSED') throw new NotFoundException('Sessão inválida ou já fechada.');

      const totals = await this.calculateSessionTotals(tx, sessionId);

      return await tx.cash_sessions.update({
        where: { id: sessionId },
        data: {
          final_amount: data.finalAmount,
          status: 'CLOSED',
          closed_at: new Date(),
          notes: `${data.notes || ''} | Esperado em Dinheiro: ${totals.cashExpected}`
        } as any
      });
    });
  }

  async registerMovement(tenantId: string, authUserId: string, data: { sessionId: string; type: 'IN' | 'OUT'; amount: number; reason: string; userName: string }) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      return await tx.cash_movements.create({
        data: {
          tenant_id: tenantId,
          session_id: data.sessionId,
          type: data.type,
          amount: data.amount,
          reason: data.reason,
          user_name: data.userName
        } as any
      });
    });
  }

  // ==========================================
  // GESTÃO DE DESPESAS (CONTAS A PAGAR)
  // ==========================================

  async createExpense(tenantId: string, authUserId: string, data: any) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      return await tx.expenses.create({
        data: {
          tenant_id: tenantId,
          description: data.description,
          amount: data.amount,
          category: data.category || 'Geral',
          due_date: new Date(data.dueDate),
          is_paid: data.isPaid || false,
          supplier_id: data.supplierId || null,
          payment_method: data.payment_method || data.paymentMethod || null,
          is_recurring: data.isRecurring || false,
        } as any
      });
    });
  }

  async updateExpense(tenantId: string, authUserId: string, expenseId: string, data: any) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      const expense = await tx.expenses.findUnique({ where: { id: expenseId } });
      if (!expense) throw new NotFoundException('Despesa não localizada.');

      return await tx.expenses.update({
        where: { id: expenseId },
        data: {
          description: data.description,
          amount: data.amount,
          category: data.category,
          due_date: new Date(data.dueDate),
          is_paid: data.isPaid,
          supplier_id: data.supplierId || null,
          payment_method: data.paymentMethod || null,
        } as any
      });
    });
  }

  async payExpense(tenantId: string, authUserId: string, expenseId: string, data: { paymentMethod: string; sessionId?: string }) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      const expense = await tx.expenses.findUnique({ where: { id: expenseId } });
      if (!expense) throw new NotFoundException('Despesa não encontrada.');

      const updated = await tx.expenses.update({
        where: { id: expenseId },
        data: { 
          is_paid: true, 
          paid_date: new Date(), 
          payment_method: data.paymentMethod 
        } as any
      });

      // Se for pago em dinheiro e houver caixa, faz a sangria automática
      if (data.paymentMethod === 'DINHEIRO' && data.sessionId) {
        await tx.cash_movements.create({
          data: {
            tenant_id: tenantId,
            session_id: data.sessionId,
            type: 'OUT',
            amount: expense.amount,
            reason: `Pagamento Despesa: ${expense.description}`,
            user_name: 'Sistema'
          } as any
        });
      }

      return updated;
    });
  }

  async deleteExpense(tenantId: string, authUserId: string, expenseId: string, data: { adminPin: string }) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      const staff = await tx.staff.findFirst({
        where: { tenant_id: tenantId, pin: data.adminPin }
      });
      if (!staff) throw new BadRequestException('PIN de administrador inválido.');

      await tx.expenses.delete({ where: { id: expenseId } });
      return { success: true };
    });
  }

  // ==========================================
  // CANCELAMENTO DE TRANSAÇÕES
  // ==========================================

  async voidTransaction(tenantId: string, authUserId: string, transactionId: string, data: { adminPin: string; userName: string }) {
    return await this.prisma.$transactionWithAuth(authUserId, async (tx) => {
      const staff = await tx.staff.findFirst({
        where: { tenant_id: tenantId, pin: data.adminPin }
      });
      if (!staff) throw new BadRequestException('PIN de administrador inválido.');

      const transaction = await tx.transactions.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new NotFoundException('Transação não encontrada.');

      await tx.transactions.update({
        where: { id: transactionId },
        data: { status: 'CANCELLED' } as any
      });

      return { success: true };
    });
  }

  // ==========================================
  // CÁLCULOS AUXILIARES
  // ==========================================

  private async calculateSessionTotals(tx: any, sessionId: string) {
    const transactions = await tx.transactions.findMany({ 
      where: { cash_session_id: sessionId, status: 'COMPLETED' } 
    });
    const movements = await tx.cash_movements.findMany({ 
      where: { session_id: sessionId } 
    });

    const salesCash = transactions
      .filter((t: any) => t.method === 'DINHEIRO')
      .reduce((acc: number, t: any) => acc + Number(t.amount), 0);

    const netMovements = movements.reduce((acc: number, m: any) => {
      return m.type === 'IN' ? acc + Number(m.amount) : acc - Number(m.amount);
    }, 0);

    const session = await tx.cash_sessions.findUnique({ where: { id: sessionId } });
    const cashExpected = Number(session.initial_amount) + salesCash + netMovements;

    return { cashExpected };
  }

  async getDashboardSummary(tenantId: string, startDate: Date, endDate: Date) {
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
}
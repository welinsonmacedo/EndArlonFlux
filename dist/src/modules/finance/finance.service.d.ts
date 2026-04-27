import { PrismaService } from '../../core/prisma/prisma.service';
export declare class FinanceService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    openSession(tenantId: string, authUserId: string, data: {
        initialAmount: number;
        operatorName: string;
        notes?: string;
    }): Promise<{
        id: string;
        status: string | null;
        tenant_id: string;
        notes: string | null;
        opened_at: Date | null;
        closed_at: Date | null;
        initial_amount: import("@prisma/client-runtime-utils").Decimal;
        final_amount: import("@prisma/client-runtime-utils").Decimal | null;
        operator_name: string | null;
    }>;
    closeSession(tenantId: string, authUserId: string, sessionId: string, data: {
        finalAmount: number;
        notes?: string;
    }): Promise<{
        id: string;
        status: string | null;
        tenant_id: string;
        notes: string | null;
        opened_at: Date | null;
        closed_at: Date | null;
        initial_amount: import("@prisma/client-runtime-utils").Decimal;
        final_amount: import("@prisma/client-runtime-utils").Decimal | null;
        operator_name: string | null;
    }>;
    registerMovement(tenantId: string, authUserId: string, data: {
        sessionId: string;
        type: 'IN' | 'OUT';
        amount: number;
        reason: string;
        userName: string;
    }): Promise<{
        id: string;
        created_at: Date | null;
        tenant_id: string;
        type: string;
        session_id: string | null;
        amount: import("@prisma/client-runtime-utils").Decimal;
        reason: string | null;
        user_name: string | null;
    }>;
    createExpense(tenantId: string, authUserId: string, data: any): Promise<{
        id: string;
        is_paid: boolean | null;
        created_at: Date | null;
        tenant_id: string;
        description: string;
        category: string | null;
        supplier_id: string | null;
        amount: import("@prisma/client-runtime-utils").Decimal;
        due_date: Date;
        paid_date: Date | null;
        is_recurring: boolean;
        payment_method: string | null;
    }>;
    updateExpense(tenantId: string, authUserId: string, expenseId: string, data: any): Promise<{
        id: string;
        is_paid: boolean | null;
        created_at: Date | null;
        tenant_id: string;
        description: string;
        category: string | null;
        supplier_id: string | null;
        amount: import("@prisma/client-runtime-utils").Decimal;
        due_date: Date;
        paid_date: Date | null;
        is_recurring: boolean;
        payment_method: string | null;
    }>;
    payExpense(tenantId: string, authUserId: string, expenseId: string, data: {
        paymentMethod: string;
        sessionId?: string;
    }): Promise<{
        id: string;
        is_paid: boolean | null;
        created_at: Date | null;
        tenant_id: string;
        description: string;
        category: string | null;
        supplier_id: string | null;
        amount: import("@prisma/client-runtime-utils").Decimal;
        due_date: Date;
        paid_date: Date | null;
        is_recurring: boolean;
        payment_method: string | null;
    }>;
    deleteExpense(tenantId: string, authUserId: string, expenseId: string, data: {
        adminPin: string;
    }): Promise<{
        success: boolean;
    }>;
    voidTransaction(tenantId: string, authUserId: string, transactionId: string, data: {
        adminPin: string;
        userName: string;
    }): Promise<{
        success: boolean;
    }>;
    private calculateSessionTotals;
    getDashboardSummary(tenantId: string, startDate: Date, endDate: Date): Promise<{
        totalRevenue: number | import("@prisma/client-runtime-utils").Decimal;
        totalExpenses: number | import("@prisma/client-runtime-utils").Decimal;
        netProfit: number;
    }>;
}

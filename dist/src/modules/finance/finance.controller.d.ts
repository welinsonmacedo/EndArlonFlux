import { FinanceService } from './finance.service';
export declare class FinanceController {
    private readonly financeService;
    constructor(financeService: FinanceService);
    open(req: any, data: any): Promise<{
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
    close(req: any, id: string, data: any): Promise<{
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
    movement(req: any, data: any): Promise<{
        id: string;
        created_at: Date | null;
        tenant_id: string;
        type: string;
        session_id: string | null;
        amount: import("@prisma/client-runtime-utils").Decimal;
        reason: string | null;
        user_name: string | null;
    }>;
    createExpense(req: any, data: any): Promise<{
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
    pay(req: any, id: string, data: any): Promise<{
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
    getSummary(req: any, start: string, end: string): Promise<{
        totalRevenue: number | import("@prisma/client-runtime-utils").Decimal;
        totalExpenses: number | import("@prisma/client-runtime-utils").Decimal;
        netProfit: number;
    }>;
}

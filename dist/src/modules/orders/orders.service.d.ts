import { PrismaService } from '../../core/prisma/prisma.service';
export declare class OrdersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    processPosSale(tenantId: string, data: any): Promise<{
        success: boolean;
        order_id: string;
    }>;
    placeOrder(tenantId: string, data: any): Promise<{
        id: string;
        is_paid: boolean | null;
        status: string | null;
        total_amount: import("@prisma/client-runtime-utils").Decimal | null;
        created_at: Date | null;
        customer_name: string | null;
        order_type: string | null;
        delivery_info: import("@prisma/client/runtime/client").JsonValue | null;
        updated_at: Date | null;
        waiter_id: string | null;
        deleted_at: Date | null;
        tenant_id: string;
        table_id: string | null;
        client_id: string | null;
        domain_table_id: string | null;
    }>;
    processPayment(tenantId: string, data: any): Promise<{
        success: boolean;
    }>;
    cancelOrder(tenantId: string, orderId: string): Promise<{
        success: boolean;
    }>;
    dispatchOrder(tenantId: string, orderId: string, courierInfo: any): Promise<{
        success: boolean;
    }>;
    updateItemStatus(tenantId: string, itemId: string, status: string): Promise<{
        success: boolean;
    }>;
    private validateItems;
}

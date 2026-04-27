import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    private extractIds;
    createItem(req: any, data: any): Promise<{
        success: boolean;
        id: string;
    }>;
    updateItem(req: any, id: string, data: any): Promise<{
        success: boolean;
    }>;
    deleteItem(req: any, id: string, data: any): Promise<{
        success: boolean;
    }>;
    adjustStock(req: any, data: any): Promise<{
        success: boolean;
    }>;
    processAdjustments(req: any, data: any): Promise<{
        success: boolean;
    }>;
    processPurchase(req: any, data: any): Promise<{
        success: boolean;
        purchaseOrderId: string;
    }>;
    createSupplier(req: any, data: any): Promise<{
        success: boolean;
        supplier: {
            number: string | null;
            id: string;
            created_at: Date | null;
            tenant_id: string;
            name: string;
            email: string | null;
            phone: string | null;
            contact_name: string | null;
            cnpj: string | null;
            ie: string | null;
            cep: string | null;
            address: string | null;
            complement: string | null;
            city: string | null;
            state: string | null;
        };
    }>;
    updateSupplier(req: any, id: string, data: any): Promise<{
        success: boolean;
        supplier: {
            number: string | null;
            id: string;
            created_at: Date | null;
            tenant_id: string;
            name: string;
            email: string | null;
            phone: string | null;
            contact_name: string | null;
            cnpj: string | null;
            ie: string | null;
            cep: string | null;
            address: string | null;
            complement: string | null;
            city: string | null;
            state: string | null;
        };
    }>;
    deleteSupplier(req: any, id: string, data: any): Promise<{
        success: boolean;
    }>;
}

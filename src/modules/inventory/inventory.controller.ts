import { Controller, Post, Get, Patch, Delete, Body, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { SupabaseGuard } from '../../core/auth/supabase.guard';

@Controller('api/inventory')
@UseGuards(SupabaseGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  private extractIds(req: any, body?: any) {
    const tenantId = body?.tenantId || req.query?.tenantId || req.headers['x-tenant-id'] || req.user?.user_metadata?.tenant_id;
    const authUserId = req.user?.id || req.user?.sub;
    if (!tenantId) throw new BadRequestException('tenantId ausente.');
    return { tenantId, authUserId };
  }

  // ==========================
  // INVENTORY ITEMS
  // ==========================
  
  // A ROTA QUE FALTAVA PARA BUSCAR OS ITENS
  @Get()
  async getItems(@Req() req) {
    // Passamos um objeto vazio pro body já que GET não tem body
    const { tenantId } = this.extractIds(req, {});
    return this.inventoryService.getInventoryItems(tenantId);
  }

  @Post('items')
  async createItem(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.createInventoryItem(tenantId, authUserId, data);
  }

  @Patch('items/:id')
  async updateItem(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.updateInventoryItem(tenantId, authUserId, id, data);
  }

  @Delete('items/:id')
  async deleteItem(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.deleteInventoryItem(tenantId, authUserId, id);
  }

  // ==========================
  // ESTOQUE (STOCK & ADJUSTMENTS)
  // ==========================
  @Post('stock/adjust')
  async adjustStock(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.adjustStock(tenantId, authUserId, data);
  }

  @Post('stock/process-adjustments')
  async processAdjustments(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.processInventoryAdjustment(tenantId, authUserId, data);
  }

  @Post('purchases')
  async processPurchase(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.processPurchase(tenantId, authUserId, data);
  }

  // ==========================
  // SUPPLIERS
  // ==========================
  @Post('suppliers')
  async createSupplier(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.createSupplier(tenantId, authUserId, data);
  }

  @Patch('suppliers/:id')
  async updateSupplier(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.updateSupplier(tenantId, authUserId, id, data);
  }

  @Delete('suppliers/:id')
  async deleteSupplier(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.inventoryService.deleteSupplier(tenantId, authUserId, id);
  }
}
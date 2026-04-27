import { Controller, Post, Get, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { SupabaseGuard } from '../../core/auth/supabase.guard';

@Controller('api/finance')
@UseGuards(SupabaseGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  private extractIds(req: any, body: any) {
    const tenantId = body?.tenantId || req.query?.tenantId || req.headers['x-tenant-id'] || req.user?.user_metadata?.tenant_id;
    const authUserId = req.user?.id;
    if (!tenantId) throw new BadRequestException('tenantId ausente.');
    return { tenantId, authUserId };
  }

  @Post('cashier/open')
  async open(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.openSession(tenantId, authUserId, data);
  }

  @Post('cashier/close/:id')
  async close(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.closeSession(tenantId, authUserId, id, data);
  }

  @Post('cashier/movement')
  async movement(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.registerMovement(tenantId, authUserId, data);
  }

  @Post('expenses')
  async createExpense(@Req() req, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.createExpense(tenantId, authUserId, data);
  }

  @Patch('expenses/:id')
  async updateExpense(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.updateExpense(tenantId, authUserId, id, data);
  }

  @Patch('expenses/:id/pay')
  async pay(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.payExpense(tenantId, authUserId, id, data);
  }

  @Delete('expenses/:id')
  async deleteExpense(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.deleteExpense(tenantId, authUserId, id, data);
  }

  @Post('transactions/:id/cancel')
  async voidTransaction(@Req() req, @Param('id') id: string, @Body() data: any) {
    const { tenantId, authUserId } = this.extractIds(req, data);
    return this.financeService.voidTransaction(tenantId, authUserId, id, data);
  }

  @Get('summary')
  async getSummary(@Req() req, @Query('start') start: string, @Query('end') end: string, @Query('tenantId') tId: string) {
    return this.financeService.getDashboardSummary(tId, new Date(start), new Date(end));
  }
}
// src/modules/finance/finance.controller.ts
import { Controller, Post, Get, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { SupabaseGuard } from '../../core/auth/supabase.guard';

@Controller('api/finance')
@UseGuards(SupabaseGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('cashier/open')
  async open(@Req() req, @Body() data: any) {
    return this.financeService.openSession(req.user.tenantId, req.user.id, data);
  }

  @Post('cashier/close/:id')
  async close(@Req() req, @Param('id') id: string, @Body() data: any) {
    return this.financeService.closeSession(req.user.tenantId, req.user.id, id, data);
  }

  @Post('cashier/movement')
  async movement(@Req() req, @Body() data: any) {
    return this.financeService.registerMovement(req.user.tenantId, req.user.id, data);
  }

  @Post('expenses')
  async createExpense(@Req() req, @Body() data: any) {
    return this.financeService.createExpense(req.user.tenantId, req.user.id, data);
  }

  @Patch('expenses/:id/pay')
  async pay(@Req() req, @Param('id') id: string, @Body() data: any) {
    return this.financeService.payExpense(req.user.tenantId, req.user.id, id, data);
  }

  @Get('summary')
  async getSummary(@Req() req, @Query('start') start: string, @Query('end') end: string) {
    return this.financeService.getDashboardSummary(
      req.user.tenantId, 
      new Date(start), 
      new Date(end)
    );
  }
}
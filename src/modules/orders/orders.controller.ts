import {
  Controller,
  Post,
  Patch,
  Body,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';

import { OrdersService } from './orders.service';
import { SupabaseGuard } from '../../core/auth/supabase.guard';

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  private validateTenant(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID é obrigatório');
    }
  }

  @Post('place')
  @UseGuards(SupabaseGuard)
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: any,
  ) {
    this.validateTenant(tenantId);
    return this.ordersService.placeOrder(tenantId, body);
  }

  @Post('pos-sale')
  @UseGuards(SupabaseGuard)
  @HttpCode(HttpStatus.CREATED)
  async processPosSale(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: any,
  ) {
    this.validateTenant(tenantId);
    return this.ordersService.processPosSale(tenantId, body);
  }

  @Post('payment')
  @UseGuards(SupabaseGuard)
  @HttpCode(HttpStatus.OK)
  async processPayment(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: any,
  ) {
    this.validateTenant(tenantId);
    return this.ordersService.processPayment(tenantId, body);
  }

  @Patch(':id/cancel')
  @UseGuards(SupabaseGuard)
  async cancelOrder(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') orderId: string,
  ) {
    this.validateTenant(tenantId);
    return this.ordersService.cancelOrder(tenantId, orderId);
  }

  @Patch(':id/dispatch')
  @UseGuards(SupabaseGuard)
  async dispatchOrder(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') orderId: string,
    @Body('courierInfo') courierInfo: any,
  ) {
    this.validateTenant(tenantId);
    return this.ordersService.dispatchOrder(tenantId, orderId, courierInfo);
  }

  @Patch('items/:itemId/status')
  @UseGuards(SupabaseGuard)
  async updateItemStatus(
    @Headers('x-tenant-id') tenantId: string,
    @Param('itemId') itemId: string,
    @Body('status') status: string,
  ) {
    this.validateTenant(tenantId);
    return this.ordersService.updateItemStatus(tenantId, itemId, status);
  }
}
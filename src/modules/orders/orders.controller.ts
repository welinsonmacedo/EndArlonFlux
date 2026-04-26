import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('place')
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(
    // Na próxima fase vamos extrair o tenantId automaticamente do Token JWT
    @Headers('x-tenant-id') tenantId: string, 
    @Body() body: any,
  ) {
    if (!tenantId) {
      return { success: false, message: 'Tenant ID é obrigatório' };
    }
    
    return this.ordersService.placeOrder(tenantId, body);
  }
}
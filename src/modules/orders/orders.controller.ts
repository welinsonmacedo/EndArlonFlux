import { Controller, Post, Body, Headers, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SupabaseGuard } from '../../core/auth/supabase.guard'; // Ajuste o caminho conforme onde guardou o ficheiro

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('place')
  @UseGuards(SupabaseGuard) // 👈 A MAGIA ACONTECE AQUI! Ninguém entra sem token válido.
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(
    @Headers('x-tenant-id') tenantId: string, 
    @Body() body: any,
  ) {
    if (!tenantId) {
      return { success: false, message: 'Tenant ID é obrigatório' };
    }
    
    return this.ordersService.placeOrder(tenantId, body);
  }
}
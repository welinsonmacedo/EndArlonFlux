import { Module } from '@nestjs/common';
import { PrismaModule } from './core/prisma/prisma.module';
import { OrdersModule } from './modules/orders/orders.module';
import { FinanceModule } from './modules/finance/finance.module';
import { InventoryModule } from './modules/inventory/inventory.module';
@Module({
  imports: [
    PrismaModule,
    OrdersModule,
    FinanceModule,
    InventoryModule,
  ],
})
export class AppModule {}
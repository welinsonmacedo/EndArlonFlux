import { Module } from '@nestjs/common';
import { PrismaModule } from './core/prisma/prisma.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    PrismaModule,
    OrdersModule, // 👈 Se isto não estiver aqui, o NestJS ignora as suas rotas de pedidos!
  ],
})
export class AppModule {}
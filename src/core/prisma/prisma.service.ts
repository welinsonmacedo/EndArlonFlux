import 'dotenv/config';
import { Injectable, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // 1. Criamos a Pool de conexão usando o link do .env
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // 2. Criamos o Adaptador do Prisma
    const adapter = new PrismaPg(pool);
    
    // 3. O Prisma v7 agora arranca usando este adaptador!
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('📦 Conectado ao banco de dados do Supabase via Prisma Adapter!');
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
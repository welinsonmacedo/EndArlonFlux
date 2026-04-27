import 'dotenv/config';
import { Injectable, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL não definida 🚨');
    }

    const pool = new Pool({
      connectionString,
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('📦 Conectado ao banco de dados!');
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }

  // ====================================================================
  // 🛡️ TRANSAÇÃO COM CONTEXTO SUPABASE (SOLUÇÃO GLOBAL PARA TRIGGERS)
  // Use este método para qualquer INSERT/UPDATE/DELETE que ative Triggers
  // ou RLS no Supabase e que precise do auth.uid()
  // ====================================================================
  async $transactionWithAuth<T>(
    authUserId: string | null,
    callback: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>
  ): Promise<T> {
    return await this.$transaction(async (tx) => {
      // Se houver um ID de utilizador (ou Tenant ID como fallback), 
      // injetamos no PostgreSQL para as Triggers não falharem.
      if (authUserId) {
        await tx.$executeRawUnsafe(`
          SELECT set_config('request.jwt.claims', '{"sub": "${authUserId}"}', true),
                 set_config('request.jwt.claim.sub', '${authUserId}', true);
        `);
      }
      
      // Executa a lógica original do seu serviço
      return await callback(tx);
    });
  }
}
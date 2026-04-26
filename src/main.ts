import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // Cria a instância do NestJS usando o AppModule
  const app = await NestFactory.create(AppModule);

  // 1. Configuração de CORS
  // Permite que o seu Front-end (React) aceda à API mesmo estando em domínios/portas diferentes
  app.enableCors({
    origin: true, // Em desenvolvimento permite qualquer origem, ou pode colocar ['http://localhost:5173']
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 2. Pipes Globais (Validação)
  // Faz com que o NestJS valide automaticamente os dados que chegam no corpo (Body) das requisições
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove campos que não estão no DTO
      forbidNonWhitelisted: true, // Dá erro se enviarem campos não permitidos
      transform: true, // Converte tipos automaticamente (ex: string para number)
    }),
  );

  // 3. Prefixo Global
  // Todas as suas rotas começarão por /api (ex: http://localhost:3000/api/orders/place)
  // app.setGlobalPrefix('api'); 

  // Inicia o servidor na porta 3000
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 ArloFlux API está a rodar em: http://localhost:${port}`);
}

bootstrap();
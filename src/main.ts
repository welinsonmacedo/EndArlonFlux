import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 👇 A CORREÇÃO MÁGICA DO CORS FICA AQUI:
  app.enableCors({
    origin: true, // Permite que o seu Front-end comunique com ele
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    // Temos de listar EXATAMENTE os cabeçalhos que o nosso Front-end envia:
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'Accept'], 
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
await app.listen(port, '0.0.0.0');
  console.log(`🚀 ArloFlux API está a rodar na porta: ${port}`);
}

bootstrap();
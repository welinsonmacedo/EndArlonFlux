import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class SupabaseGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Token de autenticação não fornecido.');
    }

    const token = authHeader.split(' ')[1]; // Pega apenas a parte do token depois da palavra "Bearer"

   try {
      // O truque do 'as string' garante que o TypeScript não reclama do .env
      const secret = process.env.SUPABASE_JWT_SECRET as string;
      const decoded = jwt.verify(token, secret);
      
      request.user = decoded; 
      return true;
    } catch (error: any) {
      // 👇 AGORA O SERVIDOR VAI DIZER-NOS A VERDADE NO LOG DO RENDER:
      console.error('🚨 Erro na validação do JWT:', error.message);
      throw new UnauthorizedException(`Falha de segurança: ${error.message}`);
    }
  }
}
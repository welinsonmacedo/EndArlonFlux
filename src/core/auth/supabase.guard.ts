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
      // O TypeScript precisa de ter a certeza que o segredo é uma string
      const secret = process.env.SUPABASE_JWT_SECRET as string;
      
      // 👇 A CORREÇÃO CRÍTICA ESTÁ AQUI: { algorithms: ['HS256'] }
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
      
      // Coloca os dados do utilizador dentro da requisição
      request.user = decoded; 
      return true;
    } catch (error: any) {
      console.error('🚨 Erro na validação do JWT:', error.message);
      throw new UnauthorizedException(`Falha de segurança: ${error.message}`);
    }
  }
}
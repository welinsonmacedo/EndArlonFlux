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
      // Verifica se o token foi assinado pelo seu Supabase e se não expirou
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
      
      // Coloca os dados do utilizador dentro da requisição para podermos usar no código depois
      request.user = decoded; 
      return true;
    } catch (error) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }
}
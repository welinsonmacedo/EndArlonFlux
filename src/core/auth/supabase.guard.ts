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

    const token = authHeader.split(' ')[1];

    try {
      const secret = process.env.SUPABASE_JWT_SECRET as string;
      
      // 👇 MODO ESPIÃO: Vamos ler o cabeçalho do token antes de o validar
      const espiao = jwt.decode(token, { complete: true });
      console.log('🕵️ CABEÇALHO DO TOKEN:', espiao?.header);
      
      // 👇 A validação com a regra estrita
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256', 'ES256'] });
      
      request.user = decoded; 
      return true;
    } catch (error: any) {
      console.error('🚨 Erro na validação do JWT:', error.message);
      throw new UnauthorizedException(`Falha de segurança: ${error.message}`);
    }
  }
}
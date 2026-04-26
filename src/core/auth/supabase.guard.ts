import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class SupabaseGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Token de autenticação não fornecido.');
    }

    const token = authHeader.split(' ')[1]; // Pega apenas a parte do token

    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
         console.error('🚨 Faltam as variáveis SUPABASE_URL ou SUPABASE_ANON_KEY no Render.');
         throw new Error("Configuração do servidor incompleta.");
      }

      // Vamos bater na porta do Supabase e perguntar: "Este token é vosso?"
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey
        }
      });

      if (!response.ok) {
         throw new Error("Token rejeitado ou expirado segundo o Supabase.");
      }

      const user = await response.json();
      
      // Se o Supabase disse "OK", deixamos passar e guardamos os dados!
      request.user = user; 
      return true;

    } catch (error: any) {
      console.error('🚨 Erro na validação Direta:', error.message);
      throw new UnauthorizedException(`Falha de segurança: ${error.message}`);
    }
  }
}
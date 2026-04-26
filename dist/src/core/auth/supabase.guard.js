"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseGuard = void 0;
const common_1 = require("@nestjs/common");
let SupabaseGuard = class SupabaseGuard {
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            throw new common_1.UnauthorizedException('Token de autenticação não fornecido.');
        }
        const token = authHeader.split(' ')[1];
        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const anonKey = process.env.SUPABASE_ANON_KEY;
            if (!supabaseUrl || !anonKey) {
                console.error('🚨 Faltam as variáveis SUPABASE_URL ou SUPABASE_ANON_KEY no Render.');
                throw new Error("Configuração do servidor incompleta.");
            }
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
            request.user = user;
            return true;
        }
        catch (error) {
            console.error('🚨 Erro na validação Direta:', error.message);
            throw new common_1.UnauthorizedException(`Falha de segurança: ${error.message}`);
        }
    }
};
exports.SupabaseGuard = SupabaseGuard;
exports.SupabaseGuard = SupabaseGuard = __decorate([
    (0, common_1.Injectable)()
], SupabaseGuard);
//# sourceMappingURL=supabase.guard.js.map
import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class SupabaseGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}

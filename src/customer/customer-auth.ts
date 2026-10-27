import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Errors } from '../common/errors';

type OrderTokenPayload = { sub: string; typ: 'order' };

/**
 * Customers have no accounts. Proving "code + phone" (or creating the order) gives a short-lived
 * token that only unlocks THAT order.
 */
@Injectable()
export class CustomerTokenService {
  constructor(private readonly jwt: JwtService) {}

  issue(orderId: string) {
    return this.jwt.sign({ sub: orderId, typ: 'order' } satisfies OrderTokenPayload);
  }

  verify(token: string): string | null {
    try {
      const p = this.jwt.verify<OrderTokenPayload>(token);
      return p.typ === 'order' && p.sub ? p.sub : null;
    } catch {
      return null;
    }
  }
}

@Injectable()
export class CustomerOrderGuard implements CanActivate {
  constructor(private readonly tokens: CustomerTokenService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const orderId = token ? this.tokens.verify(token) : null;
    if (!orderId) throw Errors.unauthorized();
    req.orderId = orderId;
    return true;
  }
}

/** The order id unlocked by the customer's token. */
export const CurrentOrderId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().orderId;
});

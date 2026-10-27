import { Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

export type CheckoutRequest = {
  paymentId: string;
  amount: number; // piasters
  currency: string;
  orderCode: string;
  customer: { name: string; phone: string; email: string | null };
  returnUrl: string;
};

export type WebhookResult = {
  paymentId?: string;
  providerRef?: string;
  status: 'PAID' | 'FAILED';
  amount: number; // piasters
  raw: Record<string, unknown>;
};

/** Any Egyptian gateway (Paymob, Fawry, Kashier…) is plugged in behind this interface. */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<{ checkoutUrl: string; providerRef?: string }>;
  /** Must verify the gateway signature and throw if it is invalid. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookResult;
}

export class InvalidWebhookSignature extends Error {}

/**
 * DEVELOPMENT ONLY. No money moves.
 * Simulate the gateway by POSTing to /api/v1/payments/webhook/mock with:
 *   body:   {"paymentId": "...", "status": "PAID" | "FAILED", "amount": <piasters>}
 *   header: x-mock-signature: hex(HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET))
 * scripts/e2e-flow.mjs shows how.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  /** Points to a fake hosted checkout page served by this API (see MockCheckoutController). */
  async createCheckout(req: CheckoutRequest) {
    return {
      checkoutUrl: `${env.appUrl}/api/v1/payments/mock/checkout/${req.paymentId}`,
      providerRef: `mock_${req.paymentId}`,
    };
  }

  /** Signs a notification exactly like the gateway would (used by the fake checkout page). */
  static sign(rawBody: string) {
    return createHmac('sha256', env.paymentWebhookSecret).update(rawBody).digest('hex');
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookResult {
    const given = String(headers['x-mock-signature'] ?? '');
    const expected = createHmac('sha256', env.paymentWebhookSecret).update(rawBody).digest('hex');
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new InvalidWebhookSignature();
    }
    const body = JSON.parse(rawBody.toString('utf8'));
    return {
      paymentId: String(body.paymentId),
      status: body.status === 'PAID' ? 'PAID' : 'FAILED',
      amount: Number(body.amount),
      raw: body,
    };
  }
}

/**
 * Placeholder for the real gateway. The brand hasn't chosen one yet (see "open questions").
 * When it is chosen, implement:
 *  1. createCheckout: create the payment on the gateway with amount (piasters), currency,
 *     merchant reference = paymentId, customer data and the return URL → return its hosted checkout URL.
 *  2. parseWebhook: verify the gateway's HMAC exactly as its docs describe, then map its
 *     transaction (success flag, amount, merchant reference) to WebhookResult.
 * Test everything in the gateway's sandbox before going live.
 */
export class PaymobPaymentProvider implements PaymentProvider {
  readonly name = 'paymob';
  private readonly logger = new Logger('PaymobPaymentProvider');

  async createCheckout(_req: CheckoutRequest): Promise<{ checkoutUrl: string; providerRef?: string }> {
    this.logger.error('Paymob provider is not implemented yet');
    throw new Error('Payment gateway not configured yet');
  }

  parseWebhook(): WebhookResult {
    throw new InvalidWebhookSignature();
  }
}

export function createPaymentProvider(): PaymentProvider {
  return env.paymentProvider === 'paymob' ? new PaymobPaymentProvider() : new MockPaymentProvider();
}

import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { money } from '../common/money';
import { env } from '../config/env';
import { Db, InjectDb } from '../db/db.module';
import { orders, payments } from '../db/schema';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers';

/**
 * DEVELOPMENT ONLY — a fake "hosted checkout" page, so the frontend can be tested end to end
 * exactly like with a real gateway: redirect → pay or fail → come back to the return URL.
 * Disabled unless PAYMENT_PROVIDER=mock (and mock is refused in production).
 */
@Controller('payments/mock/checkout')
@SkipThrottle()
export class MockCheckoutController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly paymentsService: PaymentsService,
  ) {}

  private async load(paymentId: string) {
    if (env.paymentProvider !== 'mock') throw new NotFoundException();
    const [row] = await this.db
      .select({ payment: payments, code: orders.code })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(eq(payments.id, paymentId));
    if (!row) throw new NotFoundException();
    return row;
  }

  @Get(':paymentId')
  async page(@Param('paymentId', ParseUUIDPipe) paymentId: string, @Res() res: Response) {
    const { payment, code } = await this.load(paymentId);
    const amount = money(payment.amount).egp.toLocaleString('en-US');
    const action = `/api/v1/payments/mock/checkout/${paymentId}/complete`;
    res.type('html').send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#f4efe8;margin:0;display:grid;place-items:center;min-height:100vh;color:#1c1714}
.box{background:#fff;padding:32px;border-radius:16px;max-width:360px;width:90%;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:18px;margin:0 0 4px}p{color:#6e6157;font-size:14px;margin:4px 0 20px}
.amt{font-size:32px;font-weight:700;margin:12px 0 24px}button{width:100%;height:48px;border-radius:12px;font-size:15px;margin-top:10px;cursor:pointer}
.pay{background:#1c1714;color:#fff;border:0}.fail{background:#fff;border:1px solid #c9b8a3;color:#1c1714}
.tag{display:inline-block;background:#fde7b0;color:#6b4d1f;font-size:12px;padding:4px 10px;border-radius:99px}</style></head>
<body><div class="box"><span class="tag">بوابة دفع تجريبية · للتطوير بس</span>
<h1 style="margin-top:14px">طلب ${code}</h1><p>${payment.kind === 'REMAINING' ? 'باقي المبلغ' : payment.kind === 'FULL' ? 'المبلغ كامل' : 'العربون'}</p>
<div class="amt">${amount} ج.م</div>
${payment.status !== 'PENDING' ? `<p>العملية دي اتقفلت (${payment.status}).</p>` : `
<form method="post" action="${action}?result=PAID"><button class="pay">ادفعي (نجاح)</button></form>
<form method="post" action="${action}?result=FAILED"><button class="fail">فشل الدفع</button></form>`}
</div></body></html>`);
  }

  @Post(':paymentId/complete')
  async complete(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Query('result') result: string,
    @Res() res: Response,
  ) {
    const { payment, code } = await this.load(paymentId);
    const status = result === 'PAID' ? 'PAID' : 'FAILED';
    const raw = JSON.stringify({ paymentId, status, amount: payment.amount });
    await this.paymentsService.handleWebhook('mock', Buffer.from(raw), {
      'x-mock-signature': MockPaymentProvider.sign(raw),
    });
    const back = new URL(env.paymentReturnUrl);
    back.searchParams.set('order', code);
    back.searchParams.set('payment', paymentId);
    back.searchParams.set('status', status.toLowerCase());
    res.redirect(303, back.toString());
  }
}

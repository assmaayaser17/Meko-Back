import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { AnalyticsService } from '../analytics/analytics';
import { Errors } from '../common/errors';
import { money } from '../common/money';
import { env } from '../config/env';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import { Order, orders, payments } from '../db/schema';
import { OrderStateService } from '../orders/order-state';
import { SettingsService } from '../settings/settings.service';
import { InvalidWebhookSignature, PaymentProvider } from './providers';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export type StartKind = 'DEPOSIT' | 'FULL' | 'REMAINING';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly state: OrderStateService,
    private readonly settings: SettingsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Paid amounts per kind for one order. */
  async summary(orderId: string, tx: DbOrTx = this.db) {
    const rows = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'PAID')));
    const paid = rows.reduce((sum, p) => sum + p.amount, 0);
    const paidKinds = new Set(rows.map((p) => p.kind));
    return { paid, paidKinds };
  }

  /** Starts a payment and returns the gateway checkout URL to redirect the customer to. */
  async start(orderId: string, kind: StartKind) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw Errors.notFound('الطلب');
    const { paidKinds } = await this.summary(orderId);
    const amount = await this.amountFor(order, kind, paidKinds);

    const [payment] = await this.db
      .insert(payments)
      .values({ orderId, kind, amount, provider: this.provider.name })
      .returning();

    const checkout = await this.provider.createCheckout({
      paymentId: payment.id,
      amount,
      currency: 'EGP',
      orderCode: order.code,
      customer: { name: order.customerName, phone: order.phone, email: order.email },
      returnUrl: env.paymentReturnUrl,
    });
    if (checkout.providerRef) {
      await this.db.update(payments).set({ providerRef: checkout.providerRef }).where(eq(payments.id, payment.id));
    }
    return { paymentId: payment.id, kind, amount: money(amount), checkoutUrl: checkout.checkoutUrl };
  }

  private async amountFor(order: Order, kind: StartKind, paidKinds: Set<string>) {
    const initialPaid = paidKinds.has('DEPOSIT') || paidKinds.has('FULL');
    if (kind === 'DEPOSIT' || kind === 'FULL') {
      if (order.status !== 'PENDING_PAYMENT' || initialPaid) {
        throw Errors.conflict('ALREADY_PAID', 'العربون اتدفع خلاص لطلبك');
      }
      return kind === 'DEPOSIT' ? order.depositAmount : order.total;
    }
    // REMAINING
    const s = await this.settings.get();
    if (s.remainingPaymentMode !== 'ONLINE_AFTER_APPROVAL') {
      throw Errors.conflict('REMAINING_ON_DELIVERY', 'باقي المبلغ بيتدفع عند الاستلام');
    }
    if (!['APPROVED', 'IN_PRODUCTION', 'SHIPPED'].includes(order.status)) {
      throw Errors.conflict('REMAINING_NOT_DUE', 'باقي المبلغ بيتدفع بعد ما توافقي على التصميم');
    }
    if (paidKinds.has('FULL') || paidKinds.has('REMAINING') || order.remainingAmount === 0) {
      throw Errors.conflict('NOTHING_DUE', 'مفيش مبلغ متبقي على طلبك');
    }
    return order.remainingAmount;
  }

  /**
   * Gateway → us. The ONLY place a payment becomes PAID.
   * Idempotent: the same notification received twice changes nothing the second time.
   */
  async handleWebhook(providerName: string, rawBody: Buffer | undefined, headers: Record<string, any>) {
    if (providerName !== this.provider.name || !rawBody) throw Errors.notFound();
    let result;
    try {
      result = this.provider.parseWebhook(rawBody, headers);
    } catch (e) {
      if (e instanceof InvalidWebhookSignature) {
        this.logger.warn(`Rejected ${providerName} webhook with invalid signature`);
        throw Errors.invalid('INVALID_SIGNATURE', 'invalid signature');
      }
      throw e;
    }

    await this.db.transaction(async (tx) => {
      const where = result.paymentId ? eq(payments.id, result.paymentId) : eq(payments.providerRef, result.providerRef!);
      const [payment] = await tx.select().from(payments).where(where).for('update');
      if (!payment) {
        this.logger.warn(`Webhook for unknown payment ${result.paymentId ?? result.providerRef}`);
        return;
      }
      if (payment.status === 'PAID') return; // duplicate notification

      if (result.status === 'FAILED') {
        await tx.update(payments).set({ status: 'FAILED', rawPayload: result.raw }).where(eq(payments.id, payment.id));
        return;
      }
      if (result.amount !== payment.amount) {
        this.logger.error(`Amount mismatch on payment ${payment.id}: expected ${payment.amount}, got ${result.amount}`);
        await tx.update(payments).set({ status: 'FAILED', rawPayload: result.raw }).where(eq(payments.id, payment.id));
        return;
      }

      await tx
        .update(payments)
        .set({ status: 'PAID', paidAt: new Date(), rawPayload: result.raw })
        .where(eq(payments.id, payment.id));

      if (payment.kind === 'DEPOSIT' || payment.kind === 'FULL') {
        const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for('update');
        if (order.status === 'PENDING_PAYMENT') {
          await this.state.transition(tx, order.id, 'PENDING_PAYMENT', 'DEPOSIT_PAID', `payment:${this.provider.name}`);
          await this.analytics.track('deposit_paid', `order:${order.id}`, { orderId: order.id, props: { kind: payment.kind } }, tx);
        } else {
          // e.g. paid after the order was auto-cancelled: money is recorded, staff must follow up.
          this.logger.error(`Payment ${payment.id} PAID while order ${order.code} is ${order.status}`);
        }
      }
    });
    return { received: true };
  }

  /** Which of these orders already paid their deposit / full amount (used by the cleanup job). */
  async hasPaidInitial(orderIds: string[], tx: DbOrTx = this.db) {
    if (orderIds.length === 0) return new Set<string>();
    const rows = await tx
      .select({ orderId: payments.orderId })
      .from(payments)
      .where(and(inArray(payments.orderId, orderIds), eq(payments.status, 'PAID'), inArray(payments.kind, ['DEPOSIT', 'FULL'])));
    return new Set(rows.map((r) => r.orderId));
  }
}

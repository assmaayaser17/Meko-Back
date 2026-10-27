import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Errors } from '../common/errors';
import { DbOrTx } from '../db/db.module';
import { OrderStatus, orders, statusHistory } from '../db/schema';

/**
 * The order state machine. Any transition not listed here is rejected by the server.
 * Mirrors the diagram in the backend plan document.
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['DEPOSIT_PAID', 'CANCELLED'],
  DEPOSIT_PAID: ['DESIGNING', 'CLOSED_NOT_APPROVED'],
  DESIGNING: ['DESIGN_READY', 'CLOSED_NOT_APPROVED'],
  DESIGN_READY: ['APPROVED', 'DESIGNING', 'CLOSED_NOT_APPROVED'],
  APPROVED: ['IN_PRODUCTION'],
  IN_PRODUCTION: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  CLOSED_NOT_APPROVED: [],
};

/** Labels the customer sees on the tracking page (internal names never leak to the UI). */
export const CUSTOMER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'في انتظار دفع العربون',
  DEPOSIT_PAID: 'تم الدفع',
  DESIGNING: 'جاري التصميم',
  DESIGN_READY: 'التصميم جاهز للمراجعة',
  APPROVED: 'تم اعتماد التصميم',
  IN_PRODUCTION: 'جاري التنفيذ والتغليف',
  SHIPPED: 'تم الشحن',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'الطلب اتلغى',
  CLOSED_NOT_APPROVED: 'الطلب اتقفل بدون تنفيذ',
};

/** The happy path shown as upcoming (faded) steps on the tracking timeline. */
export const HAPPY_PATH: OrderStatus[] = [
  'PENDING_PAYMENT',
  'DEPOSIT_PAID',
  'DESIGNING',
  'DESIGN_READY',
  'APPROVED',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
];

@Injectable()
export class OrderStateService {
  canTransition(from: OrderStatus, to: OrderStatus) {
    return TRANSITIONS[from].includes(to);
  }

  /**
   * Moves an order from `from` to `to` and records it in the history.
   * The UPDATE is conditional on the current status, so two concurrent requests can't both win.
   */
  async transition(
    tx: DbOrTx,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    actor: string,
    note?: string,
  ): Promise<void> {
    if (!this.canTransition(from, to)) {
      throw Errors.conflict('INVALID_STATUS_TRANSITION', 'الخطوة دي مش متاحة للطلب دلوقتي', { from, to });
    }
    const updated = await tx
      .update(orders)
      .set({ status: to })
      .where(and(eq(orders.id, orderId), eq(orders.status, from)))
      .returning({ id: orders.id });
    if (updated.length === 0) {
      throw Errors.conflict('ORDER_STATUS_CHANGED', 'حالة الطلب اتغيرت، حدّثي الصفحة وجربي تاني');
    }
    await tx.insert(statusHistory).values({ orderId, fromStatus: from, toStatus: to, actor, note });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { Db, InjectDb } from '../db/db.module';
import { orders, uploads } from '../db/schema';
import { OrderStateService } from '../orders/order-state';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';

const ORPHAN_UPLOAD_TTL_HOURS = 24;

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly state: OrderStateService,
    private readonly payments: PaymentsService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    const cancelled = await this.cancelUnpaidOrders();
    const removed = await this.deleteOrphanUploads();
    if (cancelled || removed) this.logger.log(`Cancelled ${cancelled} unpaid orders, removed ${removed} orphan uploads`);
  }

  /** Orders that never paid the deposit are cancelled after `unpaidOrderTtlHours`, and their photos deleted. */
  async cancelUnpaidOrders() {
    const s = await this.settings.get();
    const cutoff = new Date(Date.now() - s.unpaidOrderTtlHours * 3600_000);
    const stale = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'PENDING_PAYMENT'), lt(orders.createdAt, cutoff)));
    const paid = await this.payments.hasPaidInitial(stale.map((o) => o.id));

    let count = 0;
    for (const { id } of stale) {
      if (paid.has(id)) continue; // webhook will move it on
      try {
        await this.db.transaction(async (tx) => {
          await this.state.transition(tx, id, 'PENDING_PAYMENT', 'CANCELLED', 'system', 'deposit not paid in time');
          const files = await tx.delete(uploads).where(eq(uploads.orderId, id)).returning();
          for (const f of files) await this.storage.delete(f.storageKey);
        });
        count++;
      } catch (e) {
        this.logger.warn(`Could not cancel order ${id}: ${(e as Error).message}`);
      }
    }
    return count;
  }

  /** Photos uploaded during the flow but never attached to an order. */
  async deleteOrphanUploads() {
    const cutoff = new Date(Date.now() - ORPHAN_UPLOAD_TTL_HOURS * 3600_000);
    const rows = await this.db
      .select()
      .from(uploads)
      .where(and(isNull(uploads.orderId), lt(uploads.createdAt, cutoff)));
    if (rows.length === 0) return 0;
    await this.db.delete(uploads).where(inArray(uploads.id, rows.map((r) => r.id)));
    for (const r of rows) await this.storage.delete(r.storageKey);
    return rows.length;
  }
}

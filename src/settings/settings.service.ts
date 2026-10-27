import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbOrTx, InjectDb, Db } from '../db/db.module';
import { Setting, settings } from '../db/schema';

@Injectable()
export class SettingsService {
  constructor(@InjectDb() private readonly db: Db) {}

  /** Business rules (deposit %, max edits, …). The row is created with defaults if missing. */
  async get(tx: DbOrTx = this.db): Promise<Setting> {
    const [row] = await tx.select().from(settings).where(eq(settings.id, 1));
    if (row) return row;
    const [created] = await tx.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
    return created ?? (await tx.select().from(settings).where(eq(settings.id, 1)))[0];
  }

  /** Only what the customer-facing site needs to know. */
  async getPublic() {
    const s = await this.get();
    return {
      depositPercent: s.depositPercent,
      maxEdits: s.maxEdits,
      currency: s.currency,
      remainingPaymentMode: s.remainingPaymentMode,
      whatsappAvailable: Boolean(s.whatsappNumber),
    };
  }
}

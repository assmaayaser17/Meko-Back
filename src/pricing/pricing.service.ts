import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Errors } from '../common/errors';
import { money, percentOfRoundedUp } from '../common/money';
import { DbOrTx, Db, InjectDb } from '../db/db.module';
import { options, pieceTypeOptions, pieceTypes, shippingZones, styles } from '../db/schema';
import { SettingsService } from '../settings/settings.service';

export type PriceInput = {
  pieceTypeId: string;
  styleId: string;
  colorOptionId?: string | null;
  lengthOptionId?: string | null;
  governorate: string;
};

export type ResolvedSelection = Awaited<ReturnType<PricingService['resolveSelection']>>;

@Injectable()
export class PricingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
  ) {}

  /** Loads and validates the chosen piece, style and options against the catalog. */
  async resolveSelection(input: Omit<PriceInput, 'governorate'>, tx: DbOrTx = this.db) {
    const [piece] = await tx
      .select()
      .from(pieceTypes)
      .where(and(eq(pieceTypes.id, input.pieceTypeId), eq(pieceTypes.isActive, true)));
    if (!piece) throw Errors.invalid('PIECE_TYPE_INVALID', 'نوع القطعة ده مش متاح');

    const [style] = await tx
      .select()
      .from(styles)
      .where(and(eq(styles.id, input.styleId), eq(styles.pieceTypeId, piece.id), eq(styles.isActive, true)));
    if (!style) throw Errors.invalid('STYLE_INVALID', 'الستايل ده مش متاح للقطعة دي');

    const allowed = await tx
      .select({ option: options })
      .from(pieceTypeOptions)
      .innerJoin(options, eq(options.id, pieceTypeOptions.optionId))
      .where(and(eq(pieceTypeOptions.pieceTypeId, piece.id), eq(options.isActive, true)));
    const allowedColors = allowed.map((a) => a.option).filter((o) => o.kind === 'COLOR');
    const allowedLengths = allowed.map((a) => a.option).filter((o) => o.kind === 'LENGTH');

    const pick = (id: string | null | undefined, list: typeof allowedColors, code: string, label: string) => {
      if (list.length === 0) {
        if (id) throw Errors.invalid(code, `${label} مش متاح للقطعة دي`);
        return null;
      }
      if (!id) throw Errors.invalid(code, `اختاري ${label}`);
      const found = list.find((o) => o.id === id);
      if (!found) throw Errors.invalid(code, `${label} ده مش متاح للقطعة دي`);
      return found;
    };
    const color = pick(input.colorOptionId, allowedColors, 'COLOR_INVALID', 'اللون');
    const length = pick(input.lengthOptionId, allowedLengths, 'LENGTH_INVALID', 'الطول');

    return { piece, style, color, length };
  }

  /** Server-side price calculation. The frontend only displays what this returns. */
  async quote(input: PriceInput, tx: DbOrTx = this.db) {
    const sel = await this.resolveSelection(input, tx);
    const [zone] = await tx
      .select()
      .from(shippingZones)
      .where(and(eq(shippingZones.governorate, input.governorate), eq(shippingZones.isActive, true)));
    if (!zone) throw Errors.invalid('GOVERNORATE_INVALID', 'الشحن للمحافظة دي مش متاح حالياً');

    const s = await this.settings.get(tx);
    const itemPrice =
      sel.piece.basePrice + sel.style.priceDelta + (sel.color?.priceDelta ?? 0) + (sel.length?.priceDelta ?? 0);
    const shippingFee = zone.fee;
    const total = itemPrice + shippingFee;
    const depositAmount = Math.min(total, percentOfRoundedUp(total, s.depositPercent));
    const remainingAmount = total - depositAmount;

    return {
      selection: sel,
      zone,
      settings: s,
      amounts: { itemPrice, shippingFee, total, depositAmount, remainingAmount },
    };
  }

  /** What the API returns to the frontend. */
  static present(q: Awaited<ReturnType<PricingService['quote']>>) {
    return {
      currency: q.settings.currency,
      itemPrice: money(q.amounts.itemPrice),
      shippingFee: money(q.amounts.shippingFee),
      total: money(q.amounts.total),
      deposit: money(q.amounts.depositAmount),
      remaining: money(q.amounts.remainingAmount),
      depositPercent: q.settings.depositPercent,
      maxEdits: q.settings.maxEdits,
      delivery: { daysMin: q.zone.deliveryDaysMin, daysMax: q.zone.deliveryDaysMax },
    };
  }
}

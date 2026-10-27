import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { AnalyticsService } from '../analytics/analytics';
import { Errors } from '../common/errors';
import { generateOrderCode, normalizeOrderCode } from '../common/order-code';
import { normalizeEgyptPhone } from '../common/phone';
import { CustomerTokenService } from '../customer/customer-auth';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import { guidingQuestions, orders, promptChips, statusHistory, symbols } from '../db/schema';
import { PricingService } from '../pricing/pricing.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreateOrderDto, QuoteDto } from './orders.dto';

const MIN_STORY_CHARS = 10;

@Injectable()
export class OrdersService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly pricing: PricingService,
    private readonly uploads: UploadsService,
    private readonly tokens: CustomerTokenService,
    private readonly analytics: AnalyticsService,
  ) {}

  async quote(dto: QuoteDto) {
    return PricingService.present(await this.pricing.quote(dto));
  }

  async create(dto: CreateOrderDto) {
    const phone = normalizeEgyptPhone(dto.customer.phone);
    if (!phone) throw Errors.invalid('PHONE_INVALID', 'رقم الموبايل مش صح، اكتبيه زي 01012345678');

    if (dto.type === 'GIFT' && !dto.gift) {
      throw Errors.invalid('GIFT_DETAILS_REQUIRED', 'محتاجين نعرف الهدية لمين');
    }

    const result = await this.db.transaction(async (tx) => {
      const q = await this.pricing.quote(
        {
          pieceTypeId: dto.piece.pieceTypeId,
          styleId: dto.piece.styleId,
          colorOptionId: dto.piece.colorOptionId,
          lengthOptionId: dto.piece.lengthOptionId,
          governorate: dto.shipping.governorate,
        },
        tx,
      );
      const { piece, style, color, length } = q.selection;

      const story = dto.story?.trim() || null;
      if (style.isStoryDesign && (!story || story.length < MIN_STORY_CHARS)) {
        throw Errors.invalid('STORY_REQUIRED', 'احكيلنا قصتك عشان نقدر نصمم قطعتك');
      }

      const symbolRows = await this.loadActive(tx, symbols, dto.symbolIds, 'SYMBOL_INVALID', 'رمز');
      const chipRows = await this.loadActive(tx, promptChips, dto.chipIds, 'CHIP_INVALID', 'اختيار');
      const guidingAnswers = await this.resolveGuidingAnswers(tx, dto.guidingAnswers ?? []);

      const code = await this.uniqueCode(tx);
      const [order] = await tx
        .insert(orders)
        .values({
          code,
          type: dto.type,
          customerName: dto.customer.name.trim(),
          phone,
          email: dto.customer.email?.trim().toLowerCase() ?? null,
          governorate: q.zone.governorate,
          city: dto.shipping.city?.trim() ?? null,
          address: dto.shipping.address.trim(),
          pieceTypeId: piece.id,
          styleId: style.id,
          colorOptionId: color?.id ?? null,
          lengthOptionId: length?.id ?? null,
          engravingName: dto.piece.engravingName?.trim() || null,
          story,
          symbolIds: symbolRows.map((s) => s.id),
          chipIds: chipRows.map((c) => c.id),
          guidingAnswers: guidingAnswers.length ? guidingAnswers : null,
          selections: {
            pieceType: { id: piece.id, nameAr: piece.nameAr, nameEn: piece.nameEn },
            style: { id: style.id, nameAr: style.nameAr, nameEn: style.nameEn, isStoryDesign: style.isStoryDesign },
            color: color ? { id: color.id, valueAr: color.valueAr, valueEn: color.valueEn } : null,
            length: length ? { id: length.id, valueAr: length.valueAr, valueEn: length.valueEn } : null,
            symbols: symbolRows.map((s) => ({ id: s.id, nameAr: s.nameAr })),
            chips: chipRows.map((c) => ({ id: c.id, category: c.category, labelAr: c.labelAr })),
          },
          giftRelationship: dto.type === 'GIFT' ? dto.gift!.relationship : null,
          giftRecipientName: dto.type === 'GIFT' ? dto.gift!.recipientName.trim() : null,
          giftMessage: dto.type === 'GIFT' ? dto.gift!.message?.trim() || null : null,
          ...q.amounts,
          depositPercent: q.settings.depositPercent,
          maxEdits: q.settings.maxEdits,
          policyAcceptedAt: new Date(),
          utm: dto.utm ?? null,
        })
        .returning();

      await tx.insert(statusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: 'PENDING_PAYMENT',
        actor: 'customer',
      });

      await this.uploads.attachToOrder(
        tx,
        dto.uploadIds ?? [],
        order.id,
        dto.type === 'GIFT' ? ['INSPIRATION', 'HANDWRITING'] : ['INSPIRATION'],
      );

      if (dto.sessionId) {
        await this.analytics.track(
          'order_created',
          dto.sessionId,
          { orderId: order.id, props: { storyLength: story?.length ?? 0, type: dto.type } },
          tx,
        );
      }
      return { order, pricing: PricingService.present(q) };
    });

    return {
      code: result.order.code,
      status: result.order.status,
      token: this.tokens.issue(result.order.id),
      pricing: result.pricing,
    };
  }

  /** "Enter your order code + phone" → a token that unlocks that order only. */
  async access(codeInput: string, phoneInput: string) {
    const code = normalizeOrderCode(codeInput);
    const phone = normalizeEgyptPhone(phoneInput);
    if (!code || !phone) throw Errors.accessDenied();
    const [order] = await this.db
      .select({ id: orders.id, code: orders.code, status: orders.status })
      .from(orders)
      .where(and(eq(orders.code, code), eq(orders.phone, phone)));
    if (!order) throw Errors.accessDenied();
    return { code: order.code, status: order.status, token: this.tokens.issue(order.id) };
  }

  private async uniqueCode(tx: DbOrTx) {
    for (let i = 0; i < 5; i++) {
      const code = generateOrderCode();
      const [exists] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.code, code));
      if (!exists) return code;
    }
    throw new Error('Could not generate a unique order code');
  }

  private async loadActive<T extends typeof symbols | typeof promptChips>(
    tx: DbOrTx,
    table: T,
    ids: string[] | undefined,
    code: string,
    label: string,
  ) {
    const unique = [...new Set(ids ?? [])];
    if (unique.length === 0) return [] as T['$inferSelect'][];
    const rows = (await tx
      .select()
      .from(table as typeof symbols)
      .where(and(inArray(table.id, unique), eq(table.isActive, true)))) as T['$inferSelect'][];
    if (rows.length !== unique.length) throw Errors.invalid(code, `في ${label} مش متاح، حدّثي الصفحة`);
    return rows;
  }

  private async resolveGuidingAnswers(tx: DbOrTx, answers: { questionId: string; answer: string }[]) {
    const filled = answers.filter((a) => a.answer.trim());
    if (filled.length === 0) return [];
    const rows = await tx
      .select()
      .from(guidingQuestions)
      .where(inArray(guidingQuestions.id, [...new Set(filled.map((a) => a.questionId))]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return filled.map((a) => {
      const q = byId.get(a.questionId);
      if (!q) throw Errors.invalid('QUESTION_INVALID', 'في سؤال مش موجود، حدّثي الصفحة');
      return { questionId: q.id, question: q.textAr, answer: a.answer.trim() };
    });
  }
}

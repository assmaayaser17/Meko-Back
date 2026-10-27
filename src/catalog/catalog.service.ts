import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { money } from '../common/money';
import { Db, InjectDb } from '../db/db.module';
import { faqs, guidingQuestions, promptChips, shippingZones, stories, symbols } from '../db/schema';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class CatalogService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
  ) {}

  /** Everything the order flow needs in one call: pieces → styles → options, symbols, chips, guiding questions. */
  async getCatalog() {
    const pieces = await this.db.query.pieceTypes.findMany({
      where: (p, { eq }) => eq(p.isActive, true),
      orderBy: (p, { asc }) => [asc(p.sortOrder), asc(p.nameAr)],
      with: {
        styles: { where: (s, { eq }) => eq(s.isActive, true), orderBy: (s, { asc }) => [asc(s.sortOrder)] },
        pieceTypeOptions: { with: { option: true } },
      },
    });

    const [symbolRows, chipRows, questionRows, publicSettings] = await Promise.all([
      this.db.select().from(symbols).where(eq(symbols.isActive, true)).orderBy(asc(symbols.sortOrder)),
      this.db.select().from(promptChips).where(eq(promptChips.isActive, true)).orderBy(asc(promptChips.sortOrder)),
      this.db
        .select()
        .from(guidingQuestions)
        .where(eq(guidingQuestions.isActive, true))
        .orderBy(asc(guidingQuestions.sortOrder)),
      this.settings.getPublic(),
    ]);

    return {
      pieceTypes: pieces.map((p) => {
        const opts = p.pieceTypeOptions
          .map((o) => o.option)
          .filter((o) => o.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const presentOption = (o: (typeof opts)[number]) => ({
          id: o.id,
          valueAr: o.valueAr,
          valueEn: o.valueEn,
          priceDelta: money(o.priceDelta),
        });
        return {
          id: p.id,
          slug: p.slug,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          imageUrl: p.imageUrl,
          basePrice: money(p.basePrice),
          styles: p.styles.map((s) => ({
            id: s.id,
            slug: s.slug,
            nameAr: s.nameAr,
            nameEn: s.nameEn,
            imageUrl: s.imageUrl,
            priceDelta: money(s.priceDelta),
            isStoryDesign: s.isStoryDesign,
          })),
          colors: opts.filter((o) => o.kind === 'COLOR').map(presentOption),
          lengths: opts.filter((o) => o.kind === 'LENGTH').map(presentOption),
        };
      }),
      symbols: symbolRows.map((s) => ({ id: s.id, slug: s.slug, nameAr: s.nameAr, icon: s.icon })),
      chips: {
        hobbies: chipRows.filter((c) => c.category === 'HOBBY').map((c) => ({ id: c.id, labelAr: c.labelAr })),
        sports: chipRows.filter((c) => c.category === 'SPORT').map((c) => ({ id: c.id, labelAr: c.labelAr })),
        zodiac: chipRows.filter((c) => c.category === 'ZODIAC').map((c) => ({ id: c.id, labelAr: c.labelAr })),
      },
      guidingQuestions: questionRows.map((q) => ({ id: q.id, textAr: q.textAr })),
      settings: publicSettings,
    };
  }

  /** Only stories the customer consented to AND the brand published. */
  async getStories() {
    const rows = await this.db
      .select()
      .from(stories)
      .where(and(eq(stories.isPublished, true), eq(stories.customerConsent, true)))
      .orderBy(asc(stories.sortOrder));
    return rows.map((s) => ({ id: s.id, quoteAr: s.quoteAr, symbolsAr: s.symbolsAr, imageUrl: s.imageUrl }));
  }

  async getFaqs() {
    const rows = await this.db.select().from(faqs).where(eq(faqs.isActive, true)).orderBy(asc(faqs.sortOrder));
    return rows.map((f) => ({ id: f.id, questionAr: f.questionAr, answerAr: f.answerAr }));
  }

  async getShippingZones() {
    const rows = await this.db
      .select()
      .from(shippingZones)
      .where(eq(shippingZones.isActive, true))
      .orderBy(asc(shippingZones.governorate));
    return rows.map((z) => ({
      governorate: z.governorate,
      fee: money(z.fee),
      deliveryDaysMin: z.deliveryDaysMin,
      deliveryDaysMax: z.deliveryDaysMax,
    }));
  }
}

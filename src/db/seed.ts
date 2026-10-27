/**
 * Development seed. ALL PRICES, LENGTHS, FEES AND FAQ ANSWERS ARE PLACEHOLDERS:
 * replace them with the brand's real values (later from the admin panel).
 * Safe to run twice: it skips if the catalog already exists.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { egp } from '../common/money';
import { env } from '../config/env';
import * as s from './schema';

const PIECES = [
  { slug: 'necklace', nameAr: 'سلسلة', nameEn: 'Necklace', price: 500, lengths: true },
  { slug: 'bracelet', nameAr: 'أسورة', nameEn: 'Bracelet', price: 450, lengths: false },
  { slug: 'ring', nameAr: 'خاتم', nameEn: 'Ring', price: 400, lengths: false },
  { slug: 'earrings', nameAr: 'حلق', nameEn: 'Earrings', price: 450, lengths: false },
  { slug: 'anklet', nameAr: 'خلخال', nameEn: 'Anklet', price: 400, lengths: false },
  { slug: 'keychain', nameAr: 'ميدالية', nameEn: 'Keychain', price: 300, lengths: false },
  { slug: 'brooch', nameAr: 'بروش', nameEn: 'Brooch', price: 350, lengths: false },
];

const STYLES_ALL = [
  { slug: 'story', nameAr: 'تصميم من قصتك', nameEn: 'Story Design', delta: 100, story: true },
  { slug: 'name', nameAr: 'ديزاين بالاسم', nameEn: 'Name Design', delta: 0, story: false },
  { slug: 'minimal', nameAr: 'تصميم بسيط', nameEn: 'Minimal Design', delta: 0, story: false },
];
const STYLES_NECKLACE_EXTRA = [
  { slug: 'two-names-heart', nameAr: 'اسمين وقلب', nameEn: 'Two Names + Heart', delta: 50, story: false },
  { slug: 'symbols', nameAr: 'رموز وإضافات', nameEn: 'With Symbols', delta: 50, story: false },
];

const SYMBOLS = [
  ['heart', 'قلب'], ['butterfly', 'فراشة'], ['star', 'نجمة'], ['moon', 'قمر'], ['sun', 'شمس'],
  ['flower', 'وردة'], ['music', 'نوتة موسيقية'], ['book', 'كتاب'], ['wave', 'موجة'], ['infinity', 'إنفينيتي'],
];

const HOBBIES = ['القراءة', 'السفر', 'الرسم', 'الموسيقى', 'الطبخ', 'التصوير'];
const SPORTS = ['الجري', 'السباحة', 'اليوجا', 'الجيم', 'الرقص', 'ركوب الخيل'];
const ZODIAC = ['الحمل', 'الثور', 'الجوزاء', 'السرطان', 'الأسد', 'العذراء', 'الميزان', 'العقرب', 'القوس', 'الجدي', 'الدلو', 'الحوت'];

const GUIDING = [
  'بتعملي إيه في وقت فراغك؟',
  'فيه مكان أو ذكرى قريبة لقلبك؟',
  'لو صحابك وصفوكي في 3 كلمات، هيقولوا إيه؟',
  'إيه الحاجة اللي دايماً معاكي؟',
];

const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية', 'البحيرة',
  'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط',
  'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء',
];

const FAQS = [
  ['الخامة إيه، ولونها بيتغير؟', '[إجابة البراند الرسمية]'],
  ['أطوال السلسلة المتاحة؟', '[إجابة البراند الرسمية]'],
  ['التنفيذ والتوصيل بياخدوا قد إيه؟', '[إجابة البراند الرسمية]'],
  [
    'لو التصميم معجبنيش؟',
    'عندك لحد 3 تعديلات، وتقدري تكلمي المصممة على واتساب. العربون مبيترجعش لأنه بيغطي شغل المصممين، ولو موافقتيش على التصميم مش هتدفعي باقي المبلغ.',
  ],
];

async function main() {
  const pool = new Pool({ connectionString: env.databaseUrl });
  const db = drizzle(pool, { schema: s });

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.pieceTypes);
  if (count > 0) {
    console.log('Catalog already seeded, skipping.');
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(s.settings)
      .values({ id: 1, whatsappNumber: process.env.SEED_WHATSAPP_NUMBER ?? '201000000000' })
      .onConflictDoNothing();

    const [gold, silver] = await tx
      .insert(s.options)
      .values([
        { kind: 'COLOR', valueAr: 'دهبي', valueEn: 'Gold Plated', priceDelta: 0, sortOrder: 1 },
        { kind: 'COLOR', valueAr: 'فضي', valueEn: 'Silver Plated', priceDelta: 0, sortOrder: 2 },
      ])
      .returning();
    const lengths = await tx
      .insert(s.options)
      .values([
        { kind: 'LENGTH', valueAr: '40 سم', valueEn: '40 cm', sortOrder: 1 },
        { kind: 'LENGTH', valueAr: '45 سم', valueEn: '45 cm', sortOrder: 2 },
        { kind: 'LENGTH', valueAr: '50 سم', valueEn: '50 cm', sortOrder: 3 },
      ])
      .returning();

    for (const [i, p] of PIECES.entries()) {
      const [piece] = await tx
        .insert(s.pieceTypes)
        .values({ slug: p.slug, nameAr: p.nameAr, nameEn: p.nameEn, basePrice: egp(p.price), sortOrder: i })
        .returning();
      const styleList = p.slug === 'necklace' ? [STYLES_ALL[0], ...STYLES_NECKLACE_EXTRA, ...STYLES_ALL.slice(1)] : STYLES_ALL;
      await tx.insert(s.styles).values(
        styleList.map((st, j) => ({
          pieceTypeId: piece.id,
          slug: st.slug,
          nameAr: st.nameAr,
          nameEn: st.nameEn,
          priceDelta: egp(st.delta),
          isStoryDesign: st.story,
          sortOrder: j,
        })),
      );
      const opts = [gold, silver, ...(p.lengths ? lengths : [])];
      await tx.insert(s.pieceTypeOptions).values(opts.map((o) => ({ pieceTypeId: piece.id, optionId: o.id })));
    }

    await tx.insert(s.symbols).values(SYMBOLS.map(([slug, nameAr], i) => ({ slug, nameAr, icon: slug, sortOrder: i })));
    await tx.insert(s.promptChips).values([
      ...HOBBIES.map((labelAr, i) => ({ category: 'HOBBY' as const, labelAr, sortOrder: i })),
      ...SPORTS.map((labelAr, i) => ({ category: 'SPORT' as const, labelAr, sortOrder: i })),
      ...ZODIAC.map((labelAr, i) => ({ category: 'ZODIAC' as const, labelAr, sortOrder: i })),
    ]);
    await tx.insert(s.guidingQuestions).values(GUIDING.map((textAr, i) => ({ textAr, sortOrder: i })));
    await tx.insert(s.shippingZones).values(
      GOVERNORATES.map((governorate) => ({
        governorate,
        fee: egp(80),
        deliveryDaysMin: governorate === 'القاهرة' || governorate === 'الجيزة' ? 2 : 3,
        deliveryDaysMax: governorate === 'القاهرة' || governorate === 'الجيزة' ? 4 : 6,
      })),
    );
    await tx.insert(s.faqs).values(FAQS.map(([questionAr, answerAr], i) => ({ questionAr, answerAr, sortOrder: i })));
  });

  console.log('Seeded catalog (placeholder prices — replace with real ones).');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

# MEKO Accessoriez – Customer API

الباك إند للجزء اللي العميلة بتتعامل معاه: الكتالوج، والتسعير، وإنشاء الطلب، ورفع الصور، والدفع، ومراجعة التصميم والتعديلات، والتتبع.
لوحة التحكم (Admin) هي المرحلة الجاية.

**Stack:** NestJS 11 · PostgreSQL · Drizzle ORM · TypeScript

---

## التشغيل محلياً

```bash
npm install
cp .env.example .env          # وعدّلي القيم لو محتاجة
docker compose up -d          # PostgreSQL على 5432 (أو استخدمي Postgres عندك)
npm run db:migrate            # إنشاء الجداول
npm run db:seed               # كتالوج تجريبي (أسعار مؤقتة)
npm run dev                   # http://localhost:3000/api/v1
```

### اختبار الرحلة كاملة

مع السيرفر شغال (`npm run build && npm start`):

```bash
npm run test:e2e
```

السكريبت بيمشي في رحلة العميلة كلها على داتا بيز حقيقية: الكتالوج ← التسعير ← رفع صورة ← إنشاء الطلب ← دفع العربون (بوابة تجريبية) ← تسليم التصميم ← 3 تعديلات ← رفض التعديل الرابع ← الاعتماد ← دفع الباقي ← طلب هدية. (26 خطوة)

لتمثيل دور المصممة يدوياً لحد ما لوحة التحكم تتعمل:

```bash
npm run dev:deliver-design MK-XXXXXX
```

مع `PAYMENT_PROVIDER=mock` الـ `checkoutUrl` بيفتح صفحة دفع تجريبية فيها زرارين: **ادفعي (نجاح)** و**فشل الدفع**. وبعدها بترجّع للفرونت على `FRONTEND_PAYMENT_RETURN_URL`، زي البوابة الحقيقية بالظبط.

ولو حابة تأكدي الدفع من التيرمنال بدل الصفحة:

```bash
npm run dev:pay -- <paymentId>          # أو FAILED لتجربة فشل الدفع
```

### Postman

في فولدر `postman/`: اعملي Import للـ collection والـ environment، واختاري environment اسمه **MEKO – Local**، وشغّلي الـ requests بالترتيب. كل request بيحفظ الـ token والكود والـ IDs لوحده للي بعده.

---

## الرفع على Render (سيرفر تجريبي / Staging)

الريبو فيه `render.yaml`، وده بيعمل الداتا بيز والـ API مع بعض في خطوة واحدة.

1. ارفعي الكود على GitHub (repo خاص Private).
2. في Render: **New ← Blueprint**، واختاري الريبو، ثم **Apply**.
3. هيطلب منك قيمة `SEED_WHATSAPP_NUMBER`: رقم واتساب البراند بالصيغة الدولية (مثال: `2010xxxxxxxx`).
4. استني الـ deploy (حوالي 5 دقايق)، وافتحي `https://<اسم-الخدمة>.onrender.com/api/v1/health`.

مع كل تشغيل، `npm run start:render` بيعمل الـ migrations، وبعدها الـ seed (اللي بيتعدّى لو الكتالوج موجود)، وبعدها السيرفر.
والـ secrets (`JWT_SECRET` وغيرها) Render بيولّدها لوحده.

**بعد ما الفرونت يترفع:** ضيفي رابطه في `FRONTEND_ORIGIN` (مفصولة بفاصلة جنب `http://localhost:3001`)، وغيّري `FRONTEND_PAYMENT_RETURN_URL` من **Environment** في Render.

### حدود الخطة المجانية (مهم)

| الحد | الأثر علينا |
| --- | --- |
| السيرفر بينام بعد 15 دقيقة من غير زيارات | أول طلب بعدها بياخد حوالي دقيقة |
| الداتا بيز المجانية بتنتهي بعد 30 يوم | بعدها 14 يوم سماح، وبعدين بتتمسح بالداتا |
| مفيش Disk دائم | **الصور المرفوعة بتضيع مع كل deploy أو restart** |
| مفيش Shell | عشان كده الـ seed بيشتغل لوحده مع الـ start |

ده كفاية للتجربة وللعرض على البراند. **للإطلاق الحقيقي** محتاجين: خطة مدفوعة للسيرفر والداتا بيز، وتخزين الصور على S3 أو Cloudflare R2، وبوابة دفع حقيقية مع شيل `ALLOW_MOCK_PAYMENTS`.

---

## القرارات المهمة في الكود

| القرار | فين |
| --- | --- |
| مفيش حسابات للعميلات. الوصول للطلب بـ **الكود + رقم الموبايل**، وبيرجّع token خاص بالطلب ده بس | `src/customer/customer-auth.ts` |
| **الأسعار بتتحسب على السيرفر بس**، وبتتحفظ في الطلب (snapshot) | `src/pricing/pricing.service.ts` |
| الفلوس كلها **بالقرش (Integer)**، والعربون بيتقرب لأعلى جنيه | `src/common/money.ts` |
| حالات الطلب **State Machine**، وأي انتقال مش مسموح بيترفض | `src/orders/order-state.ts` |
| الدفع بيتأكد من **الـ webhook بس**، بتوقيع HMAC، والإشعار المكرر مبيأثرش | `src/payments/payments.service.ts` |
| القواعد (نسبة العربون، عدد التعديلات، رقم الواتساب…) في جدول `settings`، مش في الكود | `src/settings/settings.service.ts` |
| الصور خاصة، وبتتعرض بـ **روابط موقّعة بتنتهي**، والـ EXIF (ومنه الـ GPS) بيتشال | `src/uploads`, `src/storage` |
| الواتساب بيظهر **بس بعد أول تصميم**، والكود مكتوب جاهز في الرسالة | `src/common/whatsapp.ts` |
| الطلب اللي مدفعش العربون بيتلغى بعد 48 ساعة (قابلة للتعديل)، وصوره بتتمسح | `src/jobs/cleanup.service.ts` |
| Rate limiting على الوصول للطلب (5/دقيقة)، وإنشاء الطلب، ورفع الصور | الـ controllers |

---

## الـ API

كل المسارات تحت `/api/v1`. أي خطأ بيرجع بالشكل ده، والرسالة جاهزة تتعرض للعميلة:

```json
{ "statusCode": 409, "code": "EDIT_LIMIT_REACHED", "message": "خلصتي التعديلات المتاحة، كلمينا على واتساب ونكمل معاكي" }
```

### عام (من غير token)

| Method | Path | الوظيفة |
| --- | --- | --- |
| GET | `/catalog` | القطع ← الستايلات ← الألوان والأطوال، والرموز، والاختيارات السريعة (هوايات/رياضة/أبراج)، وأسئلة "مش عارفة تبدئي منين؟"، والقواعد العامة |
| GET | `/stories` | معرض "من القصة للقطعة" (المنشور وبموافقة العميلة بس) |
| GET | `/faqs` | الأسئلة الشائعة |
| GET | `/shipping-zones` | المحافظات ورسوم الشحن ومدة التوصيل |
| POST | `/orders/quote` | السعر أثناء الاختيار |
| POST | `/uploads` | رفع صورة (multipart: `file` + `kind` = `INSPIRATION` أو `HANDWRITING`) ← `uploadId` |
| POST | `/orders` | إنشاء الطلب ← `code` + `token` + التسعير |
| POST | `/orders/access` | `{code, phone}` ← `token` |
| POST | `/events` | أحداث الرحلة للمؤشرات |
| POST | `/payments/webhook/:provider` | من بوابة الدفع بس |

### طلب العميلة (`Authorization: Bearer <token>`)

| Method | Path | الوظيفة |
| --- | --- | --- |
| GET | `/my-order` | الملخص، والتسعير والمدفوع، والـ timeline، و`nextAction` |
| POST | `/my-order/payments` | `{kind: DEPOSIT \| FULL \| REMAINING}` ← `checkoutUrl` |
| GET | `/my-order/design` | آخر نسخة: صورة القطعة، والقطعة في الباكدج، و"إزاي قصتك بقت قطعة" |
| POST | `/my-order/design/approve` | `{versionId}` |
| POST | `/my-order/design/edit-requests` | `{categories[], text}`. التصنيفات: `NAME, SYMBOLS, SIZE, PLACEMENT, DETAILS, OTHER` |
| GET | `/my-order/whatsapp` | رابط واتساب جاهز بالكود |

`nextAction` بيقول للفرونت يعرض إيه: `PAY_DEPOSIT`, `REVIEW_DESIGN`, `PAY_REMAINING`, `WAIT_FOR_NEW_VERSION`, `WAIT`.

### مثال: إنشاء طلب

```json
POST /api/v1/orders
{
  "type": "FOR_ME",
  "customer": { "name": "سارة", "phone": "01012345678" },
  "shipping": { "governorate": "القاهرة", "city": "مدينة نصر", "address": "..." },
  "piece": { "pieceTypeId": "…", "styleId": "…", "colorOptionId": "…", "lengthOptionId": "…", "engravingName": "Sara" },
  "story": "بحب البحر جداً…",
  "symbolIds": ["…"], "chipIds": ["…"],
  "guidingAnswers": [{ "questionId": "…", "answer": "…" }],
  "uploadIds": ["…"],
  "acceptPolicy": true,
  "sessionId": "random-id-per-visit"
}
```

للهدية: `"type": "GIFT"` و`"gift": { "relationship": "MOTHER|PARTNER|SISTER|FRIEND|OTHER", "recipientName": "…", "message": "…" }`.

---

## قبل الإطلاق (لسه ناقص)

- [ ] **بوابة الدفع الحقيقية.** `src/payments/providers.ts` فيه `PaymobPaymentProvider` فاضي ومستني قرار البراند. البوابة التجريبية `mock` ممنوعة في production.
- [ ] **الأسعار الحقيقية** وأطوال السلسلة ورسوم الشحن وإجابات الأسئلة الشائعة. كلها في الـ seed مؤقتة.
- [ ] **رقم واتساب البراند** في جدول `settings` (أو `SEED_WHATSAPP_NUMBER` قبل الـ seed).
- [ ] قرار **دفع الباقي**: `settings.remaining_payment_mode` = `ONLINE_AFTER_APPROVAL` أو `CASH_ON_DELIVERY`.
- [ ] secrets طويلة وعشوائية في `.env` (السيرفر بيرفض يشتغل في production بالقيم الافتراضية).
- [ ] نقل التخزين من الديسك لـ S3 أو Cloudflare R2 (`StorageService` معمول عشان التبديل يبقى سهل).
- [ ] Backups يومية، وSentry، وHTTPS.

## الخطوة الجاية: لوحة التحكم

تسجيل دخول الموظفين والأدوار، وإدارة الكتالوج والإعدادات، وقائمة الطلبات، ورفع التصاميم مع شرح الرموز (بدل `dev:deliver-design`)، وتغيير الحالات للتنفيذ والشحن والتسليم، وزرار "ابعتي للعميلة على واتساب". جداول `staff_users` و`design_versions` جاهزة لكده.

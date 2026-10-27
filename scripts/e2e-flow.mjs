// End-to-end test of the whole customer journey against a running API + real database.
//   1) npm run build && npm start      (in another terminal, PAYMENT_PROVIDER=mock)
//   2) npm run test:e2e
// Uses the mock payment gateway and scripts/dev-deliver-design.ts to play the designer.
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const BASE = (process.env.APP_URL ?? 'http://localhost:3000') + '/api/v1';
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET;
const session = 'e2e-' + Date.now();
let passed = 0;

async function call(method, path, { body, token, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    h['content-type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

function step(name, fn) {
  return fn().then(
    () => { passed++; console.log('  ✓', name); },
    (e) => { console.error('  ✗', name, '\n   ', e.message); process.exit(1); },
  );
}

async function webhook(paymentId, amount, status = 'PAID', signWith = SECRET) {
  const raw = JSON.stringify({ paymentId, status, amount });
  const sig = createHmac('sha256', signWith).update(raw).digest('hex');
  return call('POST', '/payments/webhook/mock', { body: raw, headers: { 'x-mock-signature': sig } });
}

// a tiny valid PNG (1x1)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const ctx = {};
console.log(`E2E against ${BASE}`);

await step('health', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
});

await step('catalog has pieces, styles, options, chips, guiding questions', async () => {
  const r = await call('GET', '/catalog');
  assert.equal(r.status, 200);
  const necklace = r.json.pieceTypes.find((p) => p.slug === 'necklace');
  assert.ok(necklace, 'necklace exists');
  ctx.piece = necklace;
  ctx.story = necklace.styles.find((s) => s.isStoryDesign);
  ctx.nameStyle = necklace.styles.find((s) => s.slug === 'name');
  ctx.gold = necklace.colors[0];
  ctx.length = necklace.lengths[1];
  ctx.symbol = r.json.symbols[0];
  ctx.zodiac = r.json.chips.zodiac.at(-1);
  ctx.question = r.json.guidingQuestions[0];
  assert.ok(ctx.story && ctx.gold && ctx.length && ctx.zodiac && ctx.question);
  assert.equal(r.json.settings.maxEdits, 3);
});

await step('public lists: stories, faqs, shipping zones', async () => {
  for (const p of ['/stories', '/faqs', '/shipping-zones']) assert.equal((await call('GET', p)).status, 200);
  const zones = (await call('GET', '/shipping-zones')).json;
  assert.equal(zones.length, 27);
});

const pieceSel = () => ({
  pieceTypeId: ctx.piece.id,
  styleId: ctx.story.id,
  colorOptionId: ctx.gold.id,
  lengthOptionId: ctx.length.id,
});

await step('quote is computed on the server (deposit 50%, rounded up)', async () => {
  const r = await call('POST', '/orders/quote', { body: { ...pieceSel(), governorate: 'القاهرة' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const expectedItem = ctx.piece.basePrice.piasters + ctx.story.priceDelta.piasters + ctx.gold.priceDelta.piasters + ctx.length.priceDelta.piasters;
  assert.equal(r.json.itemPrice.piasters, expectedItem);
  assert.equal(r.json.total.piasters, expectedItem + r.json.shippingFee.piasters);
  assert.equal(r.json.deposit.piasters + r.json.remaining.piasters, r.json.total.piasters);
  ctx.quote = r.json;
});

await step('quote rejects a length on a piece that has none / missing color', async () => {
  const r = await call('POST', '/orders/quote', { body: { pieceTypeId: ctx.piece.id, styleId: ctx.story.id, governorate: 'القاهرة' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'COLOR_INVALID');
});

await step('upload: rejects a non-image, accepts a PNG (re-encoded to webp)', async () => {
  const bad = new FormData();
  bad.append('kind', 'INSPIRATION');
  bad.append('file', new Blob([Buffer.from('not an image at all')], { type: 'image/png' }), 'x.png');
  const r1 = await call('POST', '/uploads', { form: bad });
  assert.equal(r1.status, 400);
  assert.equal(r1.json.code, 'FILE_TYPE_NOT_ALLOWED');

  const good = new FormData();
  good.append('kind', 'INSPIRATION');
  good.append('file', new Blob([PNG], { type: 'image/png' }), 'inspo.png');
  const r2 = await call('POST', '/uploads', { form: good });
  assert.equal(r2.status, 201, JSON.stringify(r2.json));
  assert.equal(r2.json.mimeType, 'image/webp');
  ctx.uploadId = r2.json.uploadId;
  const img = await fetch(r2.json.url);
  assert.equal(img.status, 200);
  const tampered = await fetch(r2.json.url.replace(/sig=[0-9a-f]{4}/, 'sig=0000'));
  assert.equal(tampered.status, 404);
});

const orderBody = (overrides = {}) => ({
  type: 'FOR_ME',
  customer: { name: 'سارة', phone: '010 1234 5678' },
  shipping: { governorate: 'القاهرة', city: 'مدينة نصر', address: 'شارع عباس العقاد، عمارة 5' },
  piece: { ...pieceSel(), engravingName: 'Sara' },
  story: 'بحب البحر جداً وبروح إسكندرية كل صيف، برجي الحوت، وبحب القهوة الصبح والقراءة.',
  symbolIds: [ctx.symbol.id],
  chipIds: [ctx.zodiac.id],
  guidingAnswers: [{ questionId: ctx.question.id, answer: 'بقرا وبرسم' }],
  uploadIds: [ctx.uploadId],
  acceptPolicy: true,
  sessionId: session,
  ...overrides,
});

await step('create order: policy must be accepted', async () => {
  const r = await call('POST', '/orders', { body: orderBody({ acceptPolicy: false, uploadIds: [] }) });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'VALIDATION_ERROR');
});

await step('create order: story required for "story design"', async () => {
  const r = await call('POST', '/orders', { body: orderBody({ story: 'قصير', uploadIds: [] }) });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'STORY_REQUIRED');
});

await step('create order: gift needs gift details', async () => {
  const r = await call('POST', '/orders', { body: orderBody({ type: 'GIFT', uploadIds: [] }) });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'GIFT_DETAILS_REQUIRED');
});

await step('create order (for me) → code + token + same price as the quote', async () => {
  const r = await call('POST', '/orders', { body: orderBody() });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.code, /^MK-[2-9A-HJ-NP-Z]{6}$/);
  assert.equal(r.json.status, 'PENDING_PAYMENT');
  assert.equal(r.json.pricing.total.piasters, ctx.quote.total.piasters);
  ctx.code = r.json.code;
  ctx.token = r.json.token;
});

await step('an upload cannot be reused by another order', async () => {
  const r = await call('POST', '/orders', { body: orderBody() });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'UPLOAD_INVALID');
});

await step('access by code + phone (any format), wrong phone denied', async () => {
  const ok = await call('POST', '/orders/access', { body: { code: ctx.code.toLowerCase().replace('-', ''), phone: '+20 101 234 5678' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const bad = await call('POST', '/orders/access', { body: { code: ctx.code, phone: '01099999999' } });
  assert.equal(bad.status, 404);
  assert.equal(bad.json.code, 'ORDER_ACCESS_DENIED');
});

await step('my-order requires a token', async () => {
  assert.equal((await call('GET', '/my-order')).status, 401);
  const r = await call('GET', '/my-order', { token: ctx.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.nextAction, 'PAY_DEPOSIT');
  assert.equal(r.json.whatsappUrl, null, 'no WhatsApp before the first design');
  assert.ok(r.json.timeline.some((t) => !t.done), 'upcoming steps listed');
});

await step('design not available before payment; remaining not due yet', async () => {
  assert.equal((await call('GET', '/my-order/design', { token: ctx.token })).json.code, 'DESIGN_NOT_READY');
  assert.equal((await call('POST', '/my-order/payments', { token: ctx.token, body: { kind: 'REMAINING' } })).json.code, 'REMAINING_NOT_DUE');
});

await step('start deposit payment → checkout URL', async () => {
  const r = await call('POST', '/my-order/payments', { token: ctx.token, body: { kind: 'DEPOSIT' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.amount.piasters, ctx.quote.deposit.piasters);
  assert.ok(r.json.checkoutUrl);
  ctx.paymentId = r.json.paymentId;
});

await step('webhook: bad signature rejected, wrong amount does not pay', async () => {
  const forged = await webhook(ctx.paymentId, ctx.quote.deposit.piasters, 'PAID', 'not-the-secret');
  assert.equal(forged.status, 400);
  const wrongAmount = await webhook(ctx.paymentId, ctx.quote.deposit.piasters - 100);
  assert.equal(wrongAmount.status, 200);
  const r = await call('GET', '/my-order', { token: ctx.token });
  assert.equal(r.json.status, 'PENDING_PAYMENT');
});

await step('webhook PAID → DEPOSIT_PAID, and a duplicate webhook changes nothing', async () => {
  // a fresh payment, because the previous one may have been marked FAILED by a test above
  const p = await call('POST', '/my-order/payments', { token: ctx.token, body: { kind: 'DEPOSIT' } });
  ctx.paymentId = p.json.paymentId;
  assert.equal((await webhook(ctx.paymentId, ctx.quote.deposit.piasters)).status, 200);
  assert.equal((await webhook(ctx.paymentId, ctx.quote.deposit.piasters)).status, 200);
  const r = await call('GET', '/my-order', { token: ctx.token });
  assert.equal(r.json.status, 'DEPOSIT_PAID');
  assert.equal(r.json.pricing.paid.piasters, ctx.quote.deposit.piasters);
  const again = await call('POST', '/my-order/payments', { token: ctx.token, body: { kind: 'DEPOSIT' } });
  assert.equal(again.json.code, 'ALREADY_PAID');
});

const deliver = () => execFileSync('npx', ['tsx', 'scripts/dev-deliver-design.ts', ctx.code], { stdio: 'pipe' });

await step('designer delivers v1 → customer sees piece + package + story-to-piece + WhatsApp', async () => {
  deliver();
  const r = await call('GET', '/my-order/design', { token: ctx.token });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.versionNo, 1);
  assert.ok(r.json.images.piece && r.json.images.package);
  assert.equal(r.json.storyToPiece.length, 3);
  assert.equal(r.json.editsRemaining, 3);
  assert.ok(r.json.whatsappUrl.startsWith('https://wa.me/'));
  assert.ok(decodeURIComponent(r.json.whatsappUrl).includes(ctx.code), 'order code pre-filled');
  assert.equal((await fetch(r.json.images.piece)).status, 200);
  ctx.versionId = r.json.versionId;
});

for (let i = 1; i <= 3; i++) {
  await step(`edit request ${i}/3 → back to DESIGNING, then new version`, async () => {
    const r = await call('POST', '/my-order/design/edit-requests', {
      token: ctx.token,
      body: { categories: ['SYMBOLS', 'SIZE'], text: 'عايزة الموجة تبقى أصغر وتيجي جنب الكتاب' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.editsRemaining, 3 - i);
    assert.equal((await call('GET', '/my-order', { token: ctx.token })).json.status, 'DESIGNING');
    deliver();
  });
}

await step('4th edit is refused with a WhatsApp link', async () => {
  const r = await call('POST', '/my-order/design/edit-requests', {
    token: ctx.token,
    body: { categories: ['OTHER'], text: 'تعديل كمان لو سمحتي' },
  });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'EDIT_LIMIT_REACHED');
  assert.ok(r.json.whatsappUrl);
});

await step('approving an outdated version is refused; latest version approves', async () => {
  const old = await call('POST', '/my-order/design/approve', { token: ctx.token, body: { versionId: ctx.versionId } });
  assert.equal(old.json.code, 'DESIGN_OUTDATED');
  const latest = (await call('GET', '/my-order/design', { token: ctx.token })).json;
  assert.equal(latest.versionNo, 4);
  const r = await call('POST', '/my-order/design/approve', { token: ctx.token, body: { versionId: latest.versionId } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.status, 'APPROVED');
  assert.equal(r.json.nextAction, 'PAY_REMAINING');
});

await step('pay the remaining amount after approval', async () => {
  const p = await call('POST', '/my-order/payments', { token: ctx.token, body: { kind: 'REMAINING' } });
  assert.equal(p.status, 201, JSON.stringify(p.json));
  assert.equal(p.json.amount.piasters, ctx.quote.remaining.piasters);
  await webhook(p.json.paymentId, p.json.amount.piasters);
  const r = await call('GET', '/my-order', { token: ctx.token });
  assert.equal(r.json.pricing.remainingDue.piasters, 0);
  assert.equal(r.json.pricing.paid.piasters, ctx.quote.total.piasters);
  const timelineDone = r.json.timeline.filter((t) => t.done).map((t) => t.status);
  assert.deepEqual(timelineDone.slice(0, 3), ['PENDING_PAYMENT', 'DEPOSIT_PAID', 'DESIGNING']);
});

await step('gift order with handwriting upload', async () => {
  const form = new FormData();
  form.append('kind', 'HANDWRITING');
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'hand.png');
  const up = await call('POST', '/uploads', { form });
  const r = await call('POST', '/orders', {
    body: orderBody({
      type: 'GIFT',
      gift: { relationship: 'MOTHER', recipientName: 'ماما', message: 'كل سنة وانتي طيبة' },
      story: 'ماما بتحب الورد والقهوة وبتصحى بدري تسقي الزرع كل يوم.',
      uploadIds: [up.json.uploadId],
    }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const mine = await call('GET', '/my-order', { token: r.json.token });
  assert.equal(mine.json.gift.recipientName, 'ماما');
});

await step('analytics: client event accepted, unknown event rejected', async () => {
  assert.equal((await call('POST', '/events', { body: { name: 'payment_reached', sessionId: session, orderCode: ctx.code } })).status, 204);
  assert.equal((await call('POST', '/events', { body: { name: 'hack', sessionId: session } })).status, 400);
});

console.log(`\nAll ${passed} steps passed. Order ${ctx.code}`);

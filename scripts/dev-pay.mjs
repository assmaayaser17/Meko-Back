// DEVELOPMENT ONLY — plays the payment gateway for the mock provider.
// After the frontend redirects to checkoutUrl, run:
//   npm run dev:pay -- <paymentId>            (marks it PAID)
//   npm run dev:pay -- <paymentId> FAILED     (simulates a failed payment)
// The paymentId is in the checkoutUrl (?payment=...) and in the POST /my-order/payments response.
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import pg from 'pg';

const [paymentId, status = 'PAID'] = process.argv.slice(2);
if (!paymentId) {
  console.error('Usage: npm run dev:pay -- <paymentId> [PAID|FAILED]');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('select amount from payments where id = $1', [paymentId]);
await client.end();
if (!rows.length) {
  console.error('Payment not found');
  process.exit(1);
}

const raw = JSON.stringify({ paymentId, status, amount: rows[0].amount });
const sig = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');
const res = await fetch(`${process.env.APP_URL ?? 'http://localhost:3000'}/api/v1/payments/webhook/mock`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-mock-signature': sig },
  body: raw,
});
console.log(res.status === 200 ? `Payment ${paymentId} → ${status}` : `Webhook failed: ${res.status} ${await res.text()}`);

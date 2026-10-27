import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Env var ${name} must be a number`);
  return n;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: int('PORT', 3000),
  // On Render, RENDER_EXTERNAL_URL is set automatically (https://<service>.onrender.com).
  appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, ''),
  frontendOrigins: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  paymentReturnUrl: process.env.FRONTEND_PAYMENT_RETURN_URL ?? 'http://localhost:5173/order/payment-result',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  customerTokenTtl: process.env.CUSTOMER_TOKEN_TTL ?? '24h',
  fileUrlSecret: required('FILE_URL_SECRET'),
  fileUrlTtlSeconds: int('FILE_URL_TTL_SECONDS', 900),
  storageDir: process.env.STORAGE_DIR ?? './storage',
  uploadMaxBytes: int('UPLOAD_MAX_MB', 10) * 1024 * 1024,
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? 'mock') as 'mock' | 'paymob',
  paymentWebhookSecret: required('PAYMENT_WEBHOOK_SECRET'),
  /** Staging/demo servers only: lets a production build use the fake payment page. Never on the live site. */
  allowMockPayments: process.env.ALLOW_MOCK_PAYMENTS === 'true',
};

if (env.isProd) {
  for (const [k, v] of Object.entries({
    JWT_SECRET: env.jwtSecret,
    FILE_URL_SECRET: env.fileUrlSecret,
    PAYMENT_WEBHOOK_SECRET: env.paymentWebhookSecret,
  })) {
    if (v.startsWith('change-me') || v.length < 32) throw new Error(`${k} must be a long random secret in production`);
  }
  if (env.paymentProvider === 'mock' && !env.allowMockPayments) {
    throw new Error('PAYMENT_PROVIDER=mock is not allowed in production (set ALLOW_MOCK_PAYMENTS=true only on a staging server)');
  }
  if (env.paymentProvider === 'mock') console.warn('⚠ STAGING: fake payments are enabled (ALLOW_MOCK_PAYMENTS=true). No real money moves.');
}

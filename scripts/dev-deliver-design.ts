/**
 * DEVELOPMENT ONLY — simulates what the designer will do from the admin panel (not built yet):
 * moves the order to DESIGNING if needed, uploads 2 sample images and publishes a design version.
 *
 *   npx tsx scripts/dev-deliver-design.ts MK-XXXXXX
 */
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../src/config/env';
import * as s from '../src/db/schema';

async function sampleImage(color: string) {
  return sharp({ create: { width: 800, height: 800, channels: 3, background: color } }).webp().toBuffer();
}

async function main() {
  const code = process.argv[2];
  if (!code) throw new Error('Usage: tsx scripts/dev-deliver-design.ts MK-XXXXXX');
  const pool = new Pool({ connectionString: env.databaseUrl });
  const db = drizzle(pool, { schema: s });
  const dir = path.resolve(env.storageDir);
  await fs.mkdir(dir, { recursive: true });

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.code, code)).for('update');
    if (!order) throw new Error(`Order ${code} not found`);
    if (order.status === 'DEPOSIT_PAID') {
      await tx.update(s.orders).set({ status: 'DESIGNING' }).where(eq(s.orders.id, order.id));
      await tx.insert(s.statusHistory).values({ orderId: order.id, fromStatus: 'DEPOSIT_PAID', toStatus: 'DESIGNING', actor: 'staff:dev' });
    } else if (order.status !== 'DESIGNING') {
      throw new Error(`Order is ${order.status}; expected DEPOSIT_PAID or DESIGNING`);
    }

    const make = async (kind: 'DESIGN_PIECE' | 'DESIGN_PACKAGE', color: string) => {
      const data = await sampleImage(color);
      const storageKey = `${randomUUID()}.webp`;
      await fs.writeFile(path.join(dir, storageKey), data);
      const [u] = await tx
        .insert(s.uploads)
        .values({ orderId: order.id, kind, storageKey, mimeType: 'image/webp', sizeBytes: data.length })
        .returning();
      return u;
    };
    const piece = await make('DESIGN_PIECE', '#C9A35C');
    const pkg = await make('DESIGN_PACKAGE', '#EFE7DA');

    const [last] = await tx
      .select()
      .from(s.designVersions)
      .where(and(eq(s.designVersions.orderId, order.id)))
      .orderBy(desc(s.designVersions.versionNo))
      .limit(1);
    const versionNo = (last?.versionNo ?? 0) + 1;
    await tx.insert(s.designVersions).values({
      orderId: order.id,
      versionNo,
      pieceImageId: piece.id,
      packageImageId: pkg.id,
      symbolsExplanation: [
        { symbol: 'الموجة', reason: 'عشان البحر وصيف إسكندرية' },
        { symbol: 'السمكتين', reason: 'برج الحوت' },
        { symbol: 'الكتاب', reason: 'حبك للقراءة' },
      ],
      designerNote: 'حاولنا نخلي القطعة هادية وناعمة زي ما وصفتي نفسك.',
    });
    await tx.update(s.orders).set({ status: 'DESIGN_READY' }).where(eq(s.orders.id, order.id));
    await tx.insert(s.statusHistory).values({ orderId: order.id, fromStatus: 'DESIGNING', toStatus: 'DESIGN_READY', actor: 'staff:dev', note: `version ${versionNo}` });
    console.log(`Delivered design v${versionNo} for ${code}`);
  });
  await pool.end();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, inArray, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { Errors } from '../common/errors';
import { env } from '../config/env';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import { uploads } from '../db/schema';
import { StorageService } from '../storage/storage.service';

export type CustomerUploadKind = 'INSPIRATION' | 'HANDWRITING';
export type AnyUploadKind = CustomerUploadKind | 'DESIGN_PIECE' | 'DESIGN_PACKAGE';

const MAX_DIMENSION = 2000;

/** Detects the real file type from its first bytes (never trust the browser's mimetype). */
function sniff(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'heic' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return null;
}

@Injectable()
export class UploadsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly storage: StorageService,
  ) {}

  /**
   * Validates and stores an image. JPEG/PNG/WEBP are re-encoded to WEBP (max 2000px):
   * smaller files, correct rotation, and EXIF metadata (including GPS location) is stripped.
   * HEIC (iPhone) is stored as-is because it can't be decoded on every server.
   */
  async store(file: Express.Multer.File | undefined, kind: AnyUploadKind, orderId: string | null = null, tx: DbOrTx = this.db) {
    if (!file?.buffer?.length) throw Errors.invalid('FILE_REQUIRED', 'اختاري صورة الأول');
    if (file.size > env.uploadMaxBytes) {
      throw Errors.invalid('FILE_TOO_LARGE', `الصورة أكبر من ${env.uploadMaxBytes / 1024 / 1024} ميجا`);
    }
    const type = sniff(file.buffer);
    if (!type) throw Errors.invalid('FILE_TYPE_NOT_ALLOWED', 'ارفعي صورة بس (JPG أو PNG أو WEBP أو HEIC)');

    let data: Buffer;
    let mimeType: string;
    let ext: string;
    if (type === 'heic') {
      data = file.buffer;
      mimeType = 'image/heic';
      ext = 'heic';
    } else {
      try {
        data = await sharp(file.buffer, { failOn: 'error' })
          .rotate()
          .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        throw Errors.invalid('FILE_CORRUPTED', 'الصورة دي مش بتفتح، جربي صورة تانية');
      }
      mimeType = 'image/webp';
      ext = 'webp';
    }

    const storageKey = `${randomUUID()}.${ext}`;
    await this.storage.put(storageKey, data);
    const [row] = await tx
      .insert(uploads)
      .values({
        orderId,
        kind,
        storageKey,
        mimeType,
        sizeBytes: data.length,
        originalName: file.originalname?.slice(0, 200) ?? null,
      })
      .returning();
    return row;
  }

  /** Customer uploads are created before the order exists; this attaches them once it's created. */
  async attachToOrder(tx: DbOrTx, uploadIds: string[], orderId: string, allowedKinds: CustomerUploadKind[]) {
    if (uploadIds.length === 0) return;
    const rows = await tx
      .select()
      .from(uploads)
      .where(and(inArray(uploads.id, uploadIds), isNull(uploads.orderId)));
    if (rows.length !== new Set(uploadIds).size) {
      throw Errors.invalid('UPLOAD_INVALID', 'في صورة مش موجودة أو اتستخدمت قبل كده، ارفعيها تاني');
    }
    const badKind = rows.find((r) => !allowedKinds.includes(r.kind as CustomerUploadKind));
    if (badKind) throw Errors.invalid('UPLOAD_KIND_INVALID', 'نوع صورة مش مناسب للطلب ده');
    await tx.update(uploads).set({ orderId }).where(inArray(uploads.id, uploadIds));
  }

  present(row: { id: string; kind: string; mimeType: string; storageKey: string }) {
    return { id: row.id, kind: row.kind, mimeType: row.mimeType, url: this.storage.signedUrl(row.storageKey) };
  }
}

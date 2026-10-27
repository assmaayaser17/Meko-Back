import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../config/env';

/**
 * Private file storage on local disk. Files are never public: they are served only
 * through short-lived signed links (see FilesController).
 * To move to S3 / Cloudflare R2 later, keep this interface and swap the body.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root = path.resolve(env.storageDir);

  async onModuleInit() {
    await fs.mkdir(this.root, { recursive: true });
  }

  private resolveKey(key: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key)) throw new Error('Invalid storage key');
    const full = path.join(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer) {
    await fs.writeFile(this.resolveKey(key), data);
  }

  async read(key: string) {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string) {
    await fs.rm(this.resolveKey(key), { force: true });
  }

  private sign(key: string, exp: number) {
    return createHmac('sha256', env.fileUrlSecret).update(`${key}.${exp}`).digest('hex');
  }

  /** A link that works for FILE_URL_TTL_SECONDS only. */
  signedUrl(key: string) {
    const exp = Math.floor(Date.now() / 1000) + env.fileUrlTtlSeconds;
    return `${env.appUrl}/api/v1/files/${encodeURIComponent(key)}?exp=${exp}&sig=${this.sign(key, exp)}`;
  }

  verify(key: string, exp: number, sig: string) {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig ?? '');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}

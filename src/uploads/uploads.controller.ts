import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { env } from '../config/env';
import { Db, InjectDb } from '../db/db.module';
import { uploads } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { CustomerUploadKind, UploadsService } from './uploads.service';

class UploadBody {
  @IsIn(['INSPIRATION', 'HANDWRITING'])
  kind: CustomerUploadKind;
}

@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * Upload an inspiration / handwriting photo during the order flow (multipart, field "file").
   * Returns an uploadId to send with POST /orders. Unused uploads are deleted after 24h.
   */
  @Post('uploads')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: env.uploadMaxBytes, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Body() body: UploadBody) {
    const row = await this.uploadsService.store(file, body.kind);
    return { uploadId: row.id, ...this.uploadsService.present(row) };
  }
}

@Controller('files')
export class FilesController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly storage: StorageService,
  ) {}

  /** Serves a private file only when the signed link is valid and not expired. */
  @Get(':key')
  async get(@Param('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!this.storage.verify(key, Number(exp), sig)) throw new NotFoundException();
    const [row] = await this.db.select().from(uploads).where(eq(uploads.storageKey, key));
    if (!row) throw new NotFoundException();
    const data = await this.storage.read(key).catch(() => null);
    if (!data) throw new NotFoundException();
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  }
}

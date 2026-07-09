import { Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import * as sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { tagihanTransaksi } from '@/drizzle/schema/tagihan';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { StorageService } from '@/modules/storage/storage.service';
import { BaseProcessor } from './base.processor';

/**
 * Job payload for bukti transfer image compression.
 * Dispatched by TagihanService after orang_tua uploads a payment proof image.
 */
export interface CompressBuktiTransferJobData {
  transaksi_id: string;
  storage_path: string;
  tenant_id: string;
  tagihan_id: string;
}

/**
 * Processor for compressing bukti transfer images to WebP format.
 *
 * Flow:
 * 1. Download original image from R2 (storage_path)
 * 2. Compress to WebP format using sharp (.webp({ quality: 80 }))
 * 3. Upload compressed WebP to R2 (same path but .webp extension)
 * 4. Update tagihan_transaksi.bukti_transfer_url to new WebP path
 * 5. Delete original file from R2
 *
 * Requirements: 11.15
 */
@Processor(QUEUE_NAMES.IMAGE)
export class ImageCompressionProcessor extends BaseProcessor {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly storageService: StorageService,
  ) {
    super('ImageCompressionProcessor', { concurrency: 3, maxAttempts: 3 });
  }

  @Process('compress-bukti-transfer')
  async handleCompressBuktiTransfer(job: Job<CompressBuktiTransferJobData>): Promise<void> {
    const { transaksi_id, storage_path } = job.data;

    this.logger.log(`Compressing bukti transfer: transaksi=${transaksi_id}, path=${storage_path}`);

    // 1. Download original image from R2
    const originalBuffer = await this.storageService.download(storage_path);

    // 2. Compress to WebP format (quality 80, max width 1920px)
    const compressedBuffer = await sharp(originalBuffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // 3. Derive the new WebP path (replace extension with .webp)
    const webpPath = this.replaceExtension(storage_path, '.webp');

    // 4. Upload compressed WebP to R2
    await this.storageService.upload(webpPath, compressedBuffer, 'image/webp');

    // 5. Update tagihan_transaksi.bukti_transfer_url to new WebP path
    await this.db
      .update(tagihanTransaksi)
      .set({ buktiTransferUrl: webpPath })
      .where(eq(tagihanTransaksi.id, transaksi_id));

    // 6. Delete original file from R2
    await this.storageService.delete(storage_path);

    this.logger.log(
      `Compression complete: transaksi=${transaksi_id}, ` +
        `original=${originalBuffer.length}B → compressed=${compressedBuffer.length}B`,
    );
  }

  /**
   * Replace the file extension in a storage path with a new extension.
   * E.g. "bukti-transfer/tenant-1/tagihan-1/proof.png" → "bukti-transfer/tenant-1/tagihan-1/proof.webp"
   */
  replaceExtension(filePath: string, newExtension: string): string {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return filePath + newExtension;
    }
    return filePath.substring(0, lastDotIndex) + newExtension;
  }
}

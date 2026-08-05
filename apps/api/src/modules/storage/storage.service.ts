import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as sharp from 'sharp';
import { randomUUID } from 'crypto';

export const BUCKET_PATHS = {
  BUKTI_TRANSFER: 'bukti-transfer',
  RPP: 'rpp',
  EXPORTS: 'exports',
  LOGOS: 'logos',
} as const;

/** Allowed MIME types for logo upload. */
const ALLOWED_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Max logo size: 2 MB */
const MAX_LOGO_SIZE = 2 * 1024 * 1024;

/** Max logo dimension after resize. */
const LOGO_MAX_DIMENSION = 512;

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET')!;
    this.endpoint = this.configService.get<string>('S3_ENDPOINT')!;

    // Railway Bucket exposes REGION via ${{Bucket.REGION}}, mapped to S3_REGION in service vars.
    // Default to 'auto' so the app doesn't crash if the variable is missing.
    const region = this.configService.get<string>('S3_REGION') || 'auto';

    this.s3Client = new S3Client({
      region,
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('S3_SECRET_ACCESS_KEY')!,
      },
      // Railway Buckets use virtual-hosted-style URLs by default.
      // Set S3_FORCE_PATH_STYLE=true only if your bucket was created before the change.
      forcePathStyle: this.configService.get<string>('S3_FORCE_PATH_STYLE', 'false') === 'true',
    });
  }

  /**
   * Upload a file to R2 storage.
   * @param path - Full object key (e.g. "bukti-transfer/{tenantId}/{tagihanId}/{filename}")
   * @param file - File content as Buffer
   * @param contentType - MIME type of the file
   * @returns The object key that was stored
   */
  async upload(path: string, file: Buffer, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: file,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    this.logger.debug(`Uploaded file to ${path}`);
    return path;
  }

  /**
   * Download a file from R2 storage.
   * @param key - Object key to download
   * @returns File content as Buffer
   */
  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);
    const stream = response.Body;

    if (!stream) {
      throw new Error(`Empty response body for key: ${key}`);
    }

    // Convert readable stream to Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Delete a file from R2 storage.
   * @param key - Object key to delete
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
    this.logger.debug(`Deleted file at ${key}`);
  }

  /**
   * Generate a presigned URL for temporary access to a private object.
   * @param key - Object key
   * @param expiresIn - URL expiration in seconds (default: 300 = 5 minutes)
   * @returns Presigned URL string
   */
  async getPresignedUrl(key: string, expiresIn: number = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn });
    return url;
  }

  /**
   * Get the S3 client instance (for testing or advanced usage).
   */
  getClient(): S3Client {
    return this.s3Client;
  }

  /**
   * Construct a public URL for a stored object key.
   * Format: {endpoint}/{bucket}/{key}
   */
  getPublicUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  /**
   * Validate, resize, and upload a logo image to S3.
   *
   * - Validates MIME type via Sharp metadata (not just Content-Type header)
   * - Validates file size ≤ 2 MB
   * - Resizes to max 512×512 preserving aspect ratio, converts to WebP
   * - Uploads with a UUID-based filename under logos/{tenantId}/
   * - Returns the public URL
   *
   * Requirements: 1.2, 1.3, 1.4
   */
  async uploadLogo(tenantId: string, file: Express.Multer.File): Promise<string> {
    // Validate size before doing any processing
    if (file.size > MAX_LOGO_SIZE) {
      throw new BadRequestException('Ukuran file maksimum 2 MB.');
    }

    // Validate MIME type via Sharp metadata (not just the Content-Type header Multer provides)
    let sharpMeta: sharp.Metadata;
    try {
      sharpMeta = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('Format file tidak valid. Gunakan JPEG, PNG, atau WebP.');
    }

    // Map Sharp format names to MIME types
    const formatToMime: Record<string, string> = {
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const detectedMime = sharpMeta.format ? formatToMime[sharpMeta.format] : undefined;

    if (!detectedMime || !ALLOWED_LOGO_MIME_TYPES.includes(detectedMime)) {
      throw new BadRequestException('Format file tidak valid. Gunakan JPEG, PNG, atau WebP.');
    }

    // Resize to max 512×512, convert to WebP for storage efficiency
    const resizedBuffer = await sharp(file.buffer)
      .resize(LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();

    const uuid = randomUUID();
    const key = `${BUCKET_PATHS.LOGOS}/${tenantId}/${uuid}.webp`;

    await this.upload(key, resizedBuffer, 'image/webp');

    this.logger.log(`Logo uploaded for tenant ${tenantId}: ${key}`);
    return this.getPublicUrl(key);
  }
}

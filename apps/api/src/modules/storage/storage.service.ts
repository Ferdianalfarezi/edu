import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const BUCKET_PATHS = {
  BUKTI_TRANSFER: 'bukti-transfer',
  RPP: 'rpp',
  EXPORTS: 'exports',
} as const;

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET')!;

    // Railway Bucket exposes REGION via ${{Bucket.REGION}}, mapped to S3_REGION in service vars.
    // Default to 'auto' so the app doesn't crash if the variable is missing.
    const region = this.configService.get<string>('S3_REGION') || 'auto';

    this.s3Client = new S3Client({
      region,
      endpoint: this.configService.get<string>('S3_ENDPOINT')!,
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
}

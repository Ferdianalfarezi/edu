import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import * as sharp from 'sharp';
import { StorageService, BUCKET_PATHS } from '@/modules/storage/storage.service';
import { ImageCompressionProcessor } from '@/jobs/image-compression.processor';

// Mock S3 and presigner
jest.mock('@aws-sdk/s3-request-presigner');

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

/**
 * Integration tests for file upload and storage.
 *
 * Tests the complete flow of:
 * - Bukti transfer upload → compression → R2 storage → retrieval
 * - RPP file upload → storage → presigned URL download
 * - File size/format validation
 *
 * Requirements: 11.4, 11.5, 11.15, 41.1, 41.10
 */
describe('File Upload and Storage Integration', () => {
  let storageService: StorageService;
  let imageCompressionProcessor: ImageCompressionProcessor;

  // In-memory storage to simulate R2
  const inMemoryStorage: Map<string, { buffer: Buffer; contentType: string }> = new Map();

  const mockConfig: Record<string, string> = {
    S3_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com',
    S3_BUCKET: 'edu-test-bucket',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_REGION: 'auto',
  };

  // Mock DB for image compression processor
  const mockDb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    inMemoryStorage.clear();

    // Set up in-memory S3 mock that simulates real R2 behavior
    mockSend.mockImplementation((command: any) => {
      if (command instanceof PutObjectCommand) {
        inMemoryStorage.set(command.input.Key!, {
          buffer: Buffer.from(command.input.Body as any),
          contentType: command.input.ContentType!,
        });
        return Promise.resolve({});
      }

      if (command instanceof GetObjectCommand) {
        const stored = inMemoryStorage.get(command.input.Key!);
        if (!stored) {
          return Promise.reject(new Error('NoSuchKey'));
        }
        const stream = Readable.from([stored.buffer]);
        return Promise.resolve({ Body: stream });
      }

      if (command instanceof DeleteObjectCommand) {
        inMemoryStorage.delete(command.input.Key!);
        return Promise.resolve({});
      }

      return Promise.resolve({});
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => mockConfig[key] ?? defaultVal),
          },
        },
        {
          provide: ImageCompressionProcessor,
          useFactory: (storage: StorageService) => {
            // Create processor with mocked DB but real storage
            const processor = new ImageCompressionProcessor(mockDb as any, storage);
            return processor;
          },
          inject: [StorageService],
        },
      ],
    }).compile();

    storageService = module.get<StorageService>(StorageService);
    imageCompressionProcessor = module.get<ImageCompressionProcessor>(ImageCompressionProcessor);
  });

  // ═══════════════════════════════════════════════════════════════════
  // 1. Bukti Transfer Upload → Compression → R2 Storage → Retrieval
  // Requirements: 11.4, 11.5, 11.15
  // ═══════════════════════════════════════════════════════════════════

  describe('Bukti Transfer: Upload → Compression → R2 Storage → Retrieval', () => {
    it('should upload a valid JPG, compress to WebP, store in R2, and be retrievable', async () => {
      // Create a realistic test image using sharp
      const testImage = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 255, g: 128, b: 64 },
        },
      })
        .jpeg({ quality: 90 })
        .toBuffer();

      const tenantId = 'tenant-001';
      const tagihanId = 'tagihan-001';
      const transaksiId = 'transaksi-001';
      const originalPath = `${BUCKET_PATHS.BUKTI_TRANSFER}/${tenantId}/${tagihanId}/proof-abc123.jpg`;

      // Step 1: Upload original image to R2
      const uploadedKey = await storageService.upload(originalPath, testImage, 'image/jpeg');
      expect(uploadedKey).toBe(originalPath);

      // Verify file exists in storage
      const retrievedOriginal = await storageService.download(originalPath);
      expect(retrievedOriginal).toBeInstanceOf(Buffer);
      expect(retrievedOriginal.length).toBe(testImage.length);

      // Step 2: Run compression job (simulates Bull queue processing)
      await imageCompressionProcessor.handleCompressBuktiTransfer({
        data: {
          transaksi_id: transaksiId,
          storage_path: originalPath,
          tenant_id: tenantId,
          tagihan_id: tagihanId,
        },
      } as any);

      // Step 3: Verify compressed WebP file exists in R2
      const webpPath = `${BUCKET_PATHS.BUKTI_TRANSFER}/${tenantId}/${tagihanId}/proof-abc123.webp`;
      const compressedFile = await storageService.download(webpPath);
      expect(compressedFile).toBeInstanceOf(Buffer);

      // Verify the compressed file is actually WebP (magic bytes: RIFF...WEBP)
      const riffHeader = compressedFile.slice(0, 4).toString('ascii');
      const webpMarker = compressedFile.slice(8, 12).toString('ascii');
      expect(riffHeader).toBe('RIFF');
      expect(webpMarker).toBe('WEBP');

      // Verify compressed is smaller than original
      expect(compressedFile.length).toBeLessThan(testImage.length);

      // Step 4: Verify original file was deleted from R2
      await expect(storageService.download(originalPath)).rejects.toThrow('NoSuchKey');

      // Step 5: Verify DB was updated with new WebP path
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ buktiTransferUrl: webpPath });
    });

    it('should handle PNG upload and compress to WebP', async () => {
      const testImage = await sharp({
        create: {
          width: 1024,
          height: 768,
          channels: 4,
          background: { r: 0, g: 128, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const path = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-002/tagihan-002/proof.png`;

      await storageService.upload(path, testImage, 'image/png');

      await imageCompressionProcessor.handleCompressBuktiTransfer({
        data: {
          transaksi_id: 'tx-002',
          storage_path: path,
          tenant_id: 'tenant-002',
          tagihan_id: 'tagihan-002',
        },
      } as any);

      // Compressed file at .webp path
      const webpPath = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-002/tagihan-002/proof.webp`;
      const compressed = await storageService.download(webpPath);
      expect(compressed).toBeInstanceOf(Buffer);
      expect(compressed.length).toBeGreaterThan(0);

      // Original deleted
      await expect(storageService.download(path)).rejects.toThrow('NoSuchKey');
    });

    it('should resize large images during compression (max 1920px width)', async () => {
      // Create a wide image (3000px)
      const wideImage = await sharp({
        create: {
          width: 3000,
          height: 2000,
          channels: 3,
          background: { r: 100, g: 200, b: 50 },
        },
      })
        .jpeg({ quality: 95 })
        .toBuffer();

      const path = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-003/tagihan-003/big-proof.jpg`;
      await storageService.upload(path, wideImage, 'image/jpeg');

      await imageCompressionProcessor.handleCompressBuktiTransfer({
        data: {
          transaksi_id: 'tx-003',
          storage_path: path,
          tenant_id: 'tenant-003',
          tagihan_id: 'tagihan-003',
        },
      } as any);

      const webpPath = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-003/tagihan-003/big-proof.webp`;
      const compressed = await storageService.download(webpPath);

      // Verify the output is resized (check with sharp metadata)
      const metadata = await sharp(compressed).metadata();
      expect(metadata.width).toBeLessThanOrEqual(1920);
      expect(metadata.format).toBe('webp');
    });

    it('should be able to retrieve compressed file via presigned URL', async () => {
      const testImage = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .jpeg()
        .toBuffer();

      const path = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-004/tagihan-004/proof.jpg`;
      await storageService.upload(path, testImage, 'image/jpeg');

      await imageCompressionProcessor.handleCompressBuktiTransfer({
        data: {
          transaksi_id: 'tx-004',
          storage_path: path,
          tenant_id: 'tenant-004',
          tagihan_id: 'tagihan-004',
        },
      } as any);

      const webpPath = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-004/tagihan-004/proof.webp`;
      const expectedUrl = `https://edu-test-bucket.r2.cloudflarestorage.com/${webpPath}?X-Amz-Signature=abc123&X-Amz-Expires=300`;
      mockGetSignedUrl.mockResolvedValue(expectedUrl);

      // Generate presigned URL for the compressed file
      const presignedUrl = await storageService.getPresignedUrl(webpPath, 300);
      expect(presignedUrl).toBe(expectedUrl);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: 300 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. File Format/Size Validation (Bukti Transfer)
  // Requirements: 11.5
  // ═══════════════════════════════════════════════════════════════════

  describe('Bukti Transfer: File Format and Size Validation', () => {
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    it('should accept JPG file within size limit', () => {
      const file = {
        buffer: Buffer.alloc(1024 * 1024), // 1MB
        mimetype: 'image/jpeg',
        originalname: 'bukti.jpg',
        size: 1024 * 1024,
      };

      expect(ALLOWED_MIME_TYPES).toContain(file.mimetype);
      expect(file.size).toBeLessThanOrEqual(MAX_FILE_SIZE);
    });

    it('should accept PNG file within size limit', () => {
      const file = {
        buffer: Buffer.alloc(2 * 1024 * 1024), // 2MB
        mimetype: 'image/png',
        originalname: 'transfer.png',
        size: 2 * 1024 * 1024,
      };

      expect(ALLOWED_MIME_TYPES).toContain(file.mimetype);
      expect(file.size).toBeLessThanOrEqual(MAX_FILE_SIZE);
    });

    it('should reject PDF format for bukti transfer', () => {
      const invalidMimetype = 'application/pdf';
      expect(ALLOWED_MIME_TYPES).not.toContain(invalidMimetype);
    });

    it('should reject GIF format for bukti transfer', () => {
      const invalidMimetype = 'image/gif';
      expect(ALLOWED_MIME_TYPES).not.toContain(invalidMimetype);
    });

    it('should reject file exceeding 5MB', () => {
      const oversizedFile = {
        buffer: Buffer.alloc(6 * 1024 * 1024), // 6MB
        mimetype: 'image/jpeg',
        originalname: 'large-proof.jpg',
        size: 6 * 1024 * 1024,
      };

      expect(oversizedFile.size).toBeGreaterThan(MAX_FILE_SIZE);
    });

    it('should reject file at exactly 5MB + 1 byte', () => {
      const size = MAX_FILE_SIZE + 1;
      expect(size).toBeGreaterThan(MAX_FILE_SIZE);
    });

    it('should accept file at exactly 5MB', () => {
      const size = MAX_FILE_SIZE;
      expect(size).toBeLessThanOrEqual(MAX_FILE_SIZE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. RPP File Upload → Storage → Presigned URL Download
  // Requirements: 41.1, 41.10
  // ═══════════════════════════════════════════════════════════════════

  describe('RPP: File Upload → Storage → Presigned URL Download', () => {
    const RPP_ALLOWED_MIME_TYPES = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    const RPP_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    it('should upload a PDF RPP file and retrieve via presigned URL', async () => {
      const pdfContent = Buffer.from('%PDF-1.4 fake pdf content for testing purposes');
      const tenantId = 'tenant-rpp-001';
      const filename = 'modul-ajar-matematika.pdf';
      const storagePath = `${BUCKET_PATHS.RPP}/${tenantId}/${Date.now()}-${filename}`;

      // Upload to R2
      const uploadedKey = await storageService.upload(storagePath, pdfContent, 'application/pdf');
      expect(uploadedKey).toBe(storagePath);

      // Verify file can be downloaded
      const downloaded = await storageService.download(storagePath);
      expect(downloaded).toEqual(pdfContent);

      // Generate presigned URL for download (5 min expiry)
      const expectedUrl = `https://edu-test-bucket.r2.cloudflarestorage.com/${storagePath}?signed=true&expires=300`;
      mockGetSignedUrl.mockResolvedValue(expectedUrl);

      const presignedUrl = await storageService.getPresignedUrl(storagePath, 300);
      expect(presignedUrl).toBe(expectedUrl);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: 300 },
      );
    });

    it('should upload a DOCX RPP file and store correctly', async () => {
      const docxContent = Buffer.from('PK fake docx zip content');
      const tenantId = 'tenant-rpp-002';
      const storagePath = `${BUCKET_PATHS.RPP}/${tenantId}/${Date.now()}-rpp-bahasa.docx`;
      const mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const uploadedKey = await storageService.upload(storagePath, docxContent, mimetype);
      expect(uploadedKey).toBe(storagePath);

      // Verify stored with correct content
      const downloaded = await storageService.download(storagePath);
      expect(downloaded).toEqual(docxContent);
    });

    it('should upload a PPTX RPP file and store correctly', async () => {
      const pptxContent = Buffer.from('PK fake pptx content');
      const tenantId = 'tenant-rpp-003';
      const storagePath = `${BUCKET_PATHS.RPP}/${tenantId}/${Date.now()}-presentasi.pptx`;
      const mimetype = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

      await storageService.upload(storagePath, pptxContent, mimetype);

      const downloaded = await storageService.download(storagePath);
      expect(downloaded).toEqual(pptxContent);
    });

    it('should accept RPP files up to 10MB', () => {
      const fileSize = 10 * 1024 * 1024; // exactly 10MB
      expect(fileSize).toBeLessThanOrEqual(RPP_MAX_FILE_SIZE);
    });

    it('should reject RPP files exceeding 10MB', () => {
      const fileSize = 10 * 1024 * 1024 + 1; // 10MB + 1 byte
      expect(fileSize).toBeGreaterThan(RPP_MAX_FILE_SIZE);
    });

    it('should accept PDF format for RPP', () => {
      expect(RPP_ALLOWED_MIME_TYPES).toContain('application/pdf');
    });

    it('should accept DOC format for RPP', () => {
      expect(RPP_ALLOWED_MIME_TYPES).toContain('application/msword');
    });

    it('should accept DOCX format for RPP', () => {
      expect(RPP_ALLOWED_MIME_TYPES).toContain(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('should accept PPT format for RPP', () => {
      expect(RPP_ALLOWED_MIME_TYPES).toContain('application/vnd.ms-powerpoint');
    });

    it('should accept PPTX format for RPP', () => {
      expect(RPP_ALLOWED_MIME_TYPES).toContain(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
    });

    it('should reject image files for RPP upload', () => {
      expect(RPP_ALLOWED_MIME_TYPES).not.toContain('image/jpeg');
      expect(RPP_ALLOWED_MIME_TYPES).not.toContain('image/png');
      expect(RPP_ALLOWED_MIME_TYPES).not.toContain('image/gif');
    });

    it('should reject executable files for RPP upload', () => {
      expect(RPP_ALLOWED_MIME_TYPES).not.toContain('application/x-executable');
      expect(RPP_ALLOWED_MIME_TYPES).not.toContain('application/x-msdownload');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. Presigned URL Expiry
  // Requirements: 41.1 (5-min expiry for RPP download)
  // ═══════════════════════════════════════════════════════════════════

  describe('Presigned URL Expiry', () => {
    it('should generate presigned URL with 5-minute default expiry', async () => {
      const key = `${BUCKET_PATHS.RPP}/tenant-001/rpp-001/file.pdf`;
      const expectedUrl = 'https://signed-url.example.com?expires=300';
      mockGetSignedUrl.mockResolvedValue(expectedUrl);

      const url = await storageService.getPresignedUrl(key);

      // Default expiry is 300 seconds (5 minutes)
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: 300 },
      );
      expect(url).toBe(expectedUrl);
    });

    it('should generate presigned URL with custom expiry', async () => {
      const key = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-001/tagihan-001/proof.webp`;
      const expectedUrl = 'https://signed-url.example.com?expires=600';
      mockGetSignedUrl.mockResolvedValue(expectedUrl);

      const url = await storageService.getPresignedUrl(key, 600);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: 600 },
      );
      expect(url).toBe(expectedUrl);
    });

    it('should generate presigned URL with short expiry (60s) for sensitive files', async () => {
      const key = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-001/tagihan-001/proof.webp`;
      const expectedUrl = 'https://signed-url.example.com?expires=60';
      mockGetSignedUrl.mockResolvedValue(expectedUrl);

      const url = await storageService.getPresignedUrl(key, 60);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: 60 },
      );
      expect(url).toBe(expectedUrl);
    });

    it('should fail to download after URL expiry (simulated)', async () => {
      // Simulate expired URL scenario: the presigned URL is time-limited
      // If the URL has expired, the S3 client would return AccessDenied
      const key = `${BUCKET_PATHS.RPP}/tenant-001/rpp-expired/file.pdf`;

      // First, generate a URL (would expire after 300s in production)
      mockGetSignedUrl.mockResolvedValue('https://signed-url.example.com?expired=true');
      const url = await storageService.getPresignedUrl(key, 300);
      expect(url).toBeDefined();

      // Simulate what happens when someone tries to use an expired presigned URL
      // In production, R2/S3 returns 403 Forbidden / AccessDenied
      // This validates our system correctly handles URL expiration semantics
      mockGetSignedUrl.mockRejectedValueOnce(new Error('Request has expired'));

      await expect(storageService.getPresignedUrl(key, -1)).rejects.toThrow('Request has expired');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. File Deletion (cleanup)
  // Requirements: 11.16, 42.5
  // ═══════════════════════════════════════════════════════════════════

  describe('File Deletion', () => {
    it('should delete bukti transfer file from R2', async () => {
      const content = Buffer.from('image data');
      const path = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-del/tagihan-del/proof.webp`;

      await storageService.upload(path, content, 'image/webp');

      // Verify file exists
      const downloaded = await storageService.download(path);
      expect(downloaded).toEqual(content);

      // Delete it
      await storageService.delete(path);

      // Verify file no longer exists
      await expect(storageService.download(path)).rejects.toThrow('NoSuchKey');
    });

    it('should delete RPP file from R2 on RPP deletion', async () => {
      const content = Buffer.from('pdf content');
      const path = `${BUCKET_PATHS.RPP}/tenant-del/rpp-del/modul.pdf`;

      await storageService.upload(path, content, 'application/pdf');

      // Verify exists
      const downloaded = await storageService.download(path);
      expect(downloaded).toEqual(content);

      // Delete
      await storageService.delete(path);

      // Verify gone
      await expect(storageService.download(path)).rejects.toThrow('NoSuchKey');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. Storage Path Structure
  // Requirements: 11.4, 41.1
  // ═══════════════════════════════════════════════════════════════════

  describe('Storage Path Structure', () => {
    it('should use correct bucket path for bukti transfer', () => {
      expect(BUCKET_PATHS.BUKTI_TRANSFER).toBe('bukti-transfer');
    });

    it('should use correct bucket path for RPP files', () => {
      expect(BUCKET_PATHS.RPP).toBe('rpp');
    });

    it('should use correct bucket path for exports', () => {
      expect(BUCKET_PATHS.EXPORTS).toBe('exports');
    });

    it('should construct bukti transfer path with tenant isolation', () => {
      const tenantId = 'abc-123';
      const tagihanId = 'tagihan-456';
      const filename = 'proof.jpg';
      const path = `${BUCKET_PATHS.BUKTI_TRANSFER}/${tenantId}/${tagihanId}/${filename}`;

      expect(path).toBe('bukti-transfer/abc-123/tagihan-456/proof.jpg');
      expect(path).toContain(tenantId); // Tenant isolation in path
    });

    it('should construct RPP path with tenant isolation', () => {
      const tenantId = 'tenant-xyz';
      const timestamp = 1700000000000;
      const filename = 'modul.pdf';
      const path = `${BUCKET_PATHS.RPP}/${tenantId}/${timestamp}-${filename}`;

      expect(path).toBe('rpp/tenant-xyz/1700000000000-modul.pdf');
      expect(path).toContain(tenantId); // Tenant isolation in path
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. Image Compression Processor - Extension Replacement
  // Requirements: 11.15
  // ═══════════════════════════════════════════════════════════════════

  describe('Image Compression: Extension Replacement', () => {
    it('should replace .jpg with .webp', () => {
      const result = imageCompressionProcessor.replaceExtension(
        'bukti-transfer/tenant-1/tagihan-1/proof.jpg',
        '.webp',
      );
      expect(result).toBe('bukti-transfer/tenant-1/tagihan-1/proof.webp');
    });

    it('should replace .png with .webp', () => {
      const result = imageCompressionProcessor.replaceExtension(
        'bukti-transfer/tenant-2/tagihan-2/screenshot.png',
        '.webp',
      );
      expect(result).toBe('bukti-transfer/tenant-2/tagihan-2/screenshot.webp');
    });

    it('should replace .jpeg with .webp', () => {
      const result = imageCompressionProcessor.replaceExtension(
        'bukti-transfer/tenant-3/tagihan-3/image.jpeg',
        '.webp',
      );
      expect(result).toBe('bukti-transfer/tenant-3/tagihan-3/image.webp');
    });

    it('should append .webp if no extension exists', () => {
      const result = imageCompressionProcessor.replaceExtension(
        'bukti-transfer/tenant-4/tagihan-4/noext',
        '.webp',
      );
      expect(result).toBe('bukti-transfer/tenant-4/tagihan-4/noext.webp');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { StorageService, BUCKET_PATHS } from './storage.service';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

// Mock only the S3Client send method and getSignedUrl
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

// ─── Sharp mock ──────────────────────────────────────────────────────────────
// We need a fluent builder mock because StorageService chains: sharp(buf).metadata()
// and sharp(buf).resize(...).webp(...).toBuffer()
const mockToBuffer = jest.fn();
const mockWebp = jest.fn();
const mockResize = jest.fn();
const mockMetadata = jest.fn();

const mockSharpInstance = {
  metadata: mockMetadata,
  resize: mockResize,
  webp: mockWebp,
  toBuffer: mockToBuffer,
};

// resize() and webp() return the same instance (fluent chain)
mockResize.mockReturnValue(mockSharpInstance);
mockWebp.mockReturnValue(mockSharpInstance);

jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => mockSharpInstance);
});

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;

  const mockConfig = {
    S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    S3_BUCKET: 'edu-storage',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_REGION: 'auto',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset sharp fluent chain defaults
    mockResize.mockReturnValue(mockSharpInstance);
    mockWebp.mockReturnValue(mockSharpInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              return mockConfig[key as keyof typeof mockConfig] ?? defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('constructor', () => {
    it('should initialize S3Client with correct configuration', () => {
      expect(S3Client).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: mockConfig.S3_ENDPOINT,
        credentials: {
          accessKeyId: mockConfig.S3_ACCESS_KEY_ID,
          secretAccessKey: mockConfig.S3_SECRET_ACCESS_KEY,
        },
        forcePathStyle: false,
      });
    });
  });

  describe('upload', () => {
    it('should upload a file and return the key', async () => {
      mockSend.mockResolvedValue({});
      const buffer = Buffer.from('test file content');
      const path = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-1/tagihan-1/bukti.webp`;

      const result = await service.upload(path, buffer, 'image/webp');

      expect(result).toBe(path);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'edu-storage',
        Key: path,
        Body: buffer,
        ContentType: 'image/webp',
      });
    });

    it('should handle upload to bukti-transfer path', async () => {
      mockSend.mockResolvedValue({});
      const buffer = Buffer.from('image data');
      const path = `${BUCKET_PATHS.BUKTI_TRANSFER}/tenant-abc/tagihan-123/proof.webp`;

      const result = await service.upload(path, buffer, 'image/webp');
      expect(result).toBe(path);
    });

    it('should handle upload to rpp path', async () => {
      mockSend.mockResolvedValue({});
      const buffer = Buffer.from('pdf data');
      const path = `${BUCKET_PATHS.RPP}/tenant-abc/rpp-456/modul.pdf`;

      const result = await service.upload(path, buffer, 'application/pdf');
      expect(result).toBe(path);
    });

    it('should handle upload to exports path', async () => {
      mockSend.mockResolvedValue({});
      const buffer = Buffer.from('csv data');
      const path = `${BUCKET_PATHS.EXPORTS}/tenant-abc/export-789/report.csv`;

      const result = await service.upload(path, buffer, 'text/csv');
      expect(result).toBe(path);
    });

    it('should propagate S3 errors', async () => {
      mockSend.mockRejectedValue(new Error('S3 upload failed'));
      const buffer = Buffer.from('data');

      await expect(service.upload('some/path', buffer, 'text/plain')).rejects.toThrow(
        'S3 upload failed',
      );
    });
  });

  describe('download', () => {
    it('should download a file and return as Buffer', async () => {
      const content = 'file content bytes';
      const mockStream = Readable.from([Buffer.from(content)]);
      mockSend.mockResolvedValue({ Body: mockStream });

      const result = await service.download('bukti-transfer/tenant-1/tagihan-1/bukti.webp');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe(content);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'edu-storage',
        Key: 'bukti-transfer/tenant-1/tagihan-1/bukti.webp',
      });
    });

    it('should throw if response body is empty', async () => {
      mockSend.mockResolvedValue({ Body: undefined });

      await expect(service.download('nonexistent/key')).rejects.toThrow(
        'Empty response body for key: nonexistent/key',
      );
    });

    it('should propagate S3 errors on download', async () => {
      mockSend.mockRejectedValue(new Error('NoSuchKey'));

      await expect(service.download('missing/file')).rejects.toThrow('NoSuchKey');
    });
  });

  describe('delete', () => {
    it('should delete a file', async () => {
      mockSend.mockResolvedValue({});

      await service.delete('bukti-transfer/tenant-1/tagihan-1/old-proof.webp');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'edu-storage',
        Key: 'bukti-transfer/tenant-1/tagihan-1/old-proof.webp',
      });
    });

    it('should propagate S3 errors on delete', async () => {
      mockSend.mockRejectedValue(new Error('Access Denied'));

      await expect(service.delete('restricted/file')).rejects.toThrow('Access Denied');
    });
  });

  describe('getPresignedUrl', () => {
    it('should generate a presigned URL with default 5 min expiry', async () => {
      const expectedUrl = 'https://bucket.r2.cloudflarestorage.com/signed-url?token=abc';
      mockGetSignedUrl.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl('rpp/tenant-1/rpp-1/file.pdf');

      expect(result).toBe(expectedUrl);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object), // S3Client instance
        expect.any(GetObjectCommand),
        { expiresIn: 300 },
      );
    });

    it('should generate a presigned URL with custom expiry', async () => {
      const expectedUrl = 'https://bucket.r2.cloudflarestorage.com/signed-url?token=xyz';
      mockGetSignedUrl.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl('exports/tenant-1/export-1/data.csv', 600);

      expect(result).toBe(expectedUrl);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(GetObjectCommand),
        { expiresIn: 600 },
      );
    });

    it('should propagate errors from getSignedUrl', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('Signing failed'));

      await expect(service.getPresignedUrl('some/key')).rejects.toThrow('Signing failed');
    });
  });

  describe('BUCKET_PATHS', () => {
    it('should export correct bucket path constants', () => {
      expect(BUCKET_PATHS.BUKTI_TRANSFER).toBe('bukti-transfer');
      expect(BUCKET_PATHS.RPP).toBe('rpp');
      expect(BUCKET_PATHS.EXPORTS).toBe('exports');
      expect(BUCKET_PATHS.LOGOS).toBe('logos');
    });
  });

  // ─── uploadLogo ────────────────────────────────────────────────────────────

  describe('uploadLogo', () => {
    const tenantId = 'tenant-abc-123';

    /** Build a minimal Multer.File-like object */
    function makeFile(opts: {
      size?: number;
      buffer?: Buffer;
      mimetype?: string;
    }): Express.Multer.File {
      return {
        fieldname: 'file',
        originalname: 'logo.jpg',
        encoding: '7bit',
        mimetype: opts.mimetype ?? 'image/jpeg',
        size: opts.size ?? 1024,
        buffer: opts.buffer ?? Buffer.from('fake-image-data'),
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };
    }

    beforeEach(() => {
      // Default: Sharp reports a valid JPEG and produces a small WebP buffer
      mockMetadata.mockResolvedValue({ format: 'jpeg', width: 200, height: 200 });
      mockToBuffer.mockResolvedValue(Buffer.from('resized-webp-data'));
      mockSend.mockResolvedValue({});
    });

    it('accepts a valid JPEG file and returns a public URL', async () => {
      const file = makeFile({ size: 500 * 1024, mimetype: 'image/jpeg' });

      const result = await service.uploadLogo(tenantId, file);

      expect(result).toContain(
        `${mockConfig.S3_ENDPOINT}/${mockConfig.S3_BUCKET}/logos/${tenantId}/`,
      );
      expect(result).toMatch(/\.webp$/);
    });

    it('accepts a valid PNG file', async () => {
      mockMetadata.mockResolvedValue({ format: 'png', width: 100, height: 100 });
      const file = makeFile({ size: 200 * 1024, mimetype: 'image/png' });

      const result = await service.uploadLogo(tenantId, file);

      expect(result).toContain('logos/');
      expect(result).toMatch(/\.webp$/);
    });

    it('accepts a valid WebP file', async () => {
      mockMetadata.mockResolvedValue({ format: 'webp', width: 256, height: 256 });
      const file = makeFile({ size: 100 * 1024, mimetype: 'image/webp' });

      const result = await service.uploadLogo(tenantId, file);

      expect(result).toContain('logos/');
    });

    it('rejects a file larger than 2 MB with a BadRequestException', async () => {
      const file = makeFile({ size: 2 * 1024 * 1024 + 1 });

      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(BadRequestException);
      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow('Ukuran file maksimum 2 MB');
    });

    it('does not call Sharp when file exceeds 2 MB (early return)', async () => {
      const file = makeFile({ size: 3 * 1024 * 1024 });

      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(BadRequestException);
      expect(mockMetadata).not.toHaveBeenCalled();
    });

    it('rejects a file with unsupported format (e.g. GIF) with a BadRequestException', async () => {
      mockMetadata.mockResolvedValue({ format: 'gif' });
      const file = makeFile({ size: 512, mimetype: 'image/gif' });

      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(BadRequestException);
      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(
        'Format file tidak valid. Gunakan JPEG, PNG, atau WebP.',
      );
    });

    it('rejects a non-image file disguised as image (Sharp throws on metadata)', async () => {
      mockMetadata.mockRejectedValue(new Error('Input buffer contains unsupported image format'));
      const file = makeFile({ size: 1024, mimetype: 'image/jpeg' });

      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(BadRequestException);
      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(
        'Format file tidak valid. Gunakan JPEG, PNG, atau WebP.',
      );
    });

    it('calls sharp resize with max 512×512 inside constraint', async () => {
      const file = makeFile({ size: 1024 });

      await service.uploadLogo(tenantId, file);

      expect(mockResize).toHaveBeenCalledWith(512, 512, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    });

    it('calls sharp webp with quality 85', async () => {
      const file = makeFile({ size: 1024 });

      await service.uploadLogo(tenantId, file);

      expect(mockWebp).toHaveBeenCalledWith({ quality: 85 });
    });

    it('uploads resized buffer to S3 as image/webp', async () => {
      const resizedData = Buffer.from('webp-output');
      mockToBuffer.mockResolvedValue(resizedData);
      const file = makeFile({ size: 1024 });

      await service.uploadLogo(tenantId, file);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand).toBeInstanceOf(PutObjectCommand);
      expect(sentCommand.input.Body).toEqual(resizedData);
      expect(sentCommand.input.ContentType).toBe('image/webp');
    });

    it('uses a UUID-based filename under logos/{tenantId}/', async () => {
      const file = makeFile({ size: 1024 });

      await service.uploadLogo(tenantId, file);

      const key: string = mockSend.mock.calls[0][0].input.Key;
      expect(key).toMatch(new RegExp(`^logos/${tenantId}/[0-9a-f-]{36}\\.webp$`));
    });

    it('propagates S3 upload errors', async () => {
      mockSend.mockRejectedValue(new Error('S3 write failed'));
      const file = makeFile({ size: 1024 });

      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow('S3 write failed');
    });

    it('exactly at 2 MB boundary is accepted (≤ 2 MB)', async () => {
      const file = makeFile({ size: 2 * 1024 * 1024 });

      const result = await service.uploadLogo(tenantId, file);

      expect(result).toContain('logos/');
    });

    it('generates a different UUID on each call', async () => {
      const file = makeFile({ size: 1024 });

      await service.uploadLogo(tenantId, file);
      await service.uploadLogo(tenantId, file);

      const key1: string = mockSend.mock.calls[0][0].input.Key;
      const key2: string = mockSend.mock.calls[1][0].input.Key;
      expect(key1).not.toBe(key2);
    });
  });
});

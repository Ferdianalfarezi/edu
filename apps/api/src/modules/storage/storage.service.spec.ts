import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
        forcePathStyle: true,
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
    });
  });
});

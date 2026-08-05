import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import * as fc from 'fast-check';
import {
  EmailProcessor,
  PasswordResetJobData,
  PasswordChangedConfirmationJobData,
  UserCredentialsJobData,
  TenantCredentialsJobData,
  emailTemplates,
} from './email.processor';

// Mock googleapis
const mockSend = jest.fn().mockResolvedValue({ data: { id: 'msg-123' } });
jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn().mockImplementation(() => ({})),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        messages: {
          send: (...args: unknown[]) => mockSend(...args),
        },
      },
    }),
  },
}));

describe('EmailProcessor', () => {
  let processor: EmailProcessor;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        GMAIL_SERVICE_ACCOUNT_EMAIL: 'sa@project.iam.gserviceaccount.com',
        GMAIL_SERVICE_ACCOUNT_KEY: JSON.stringify({
          private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
        }),
        GMAIL_SENDER_EMAIL: 'noreply@school.id',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailProcessor, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
  });

  // ─── send-password-reset ─────────────────────────────────────────────────

  describe('handlePasswordReset', () => {
    it('should send password reset email via Gmail API', async () => {
      const jobData: PasswordResetJobData = {
        to: 'guru@school.id',
        name: 'Pak Budi',
        resetUrl: 'https://app.school.id/reset-password?token=abc123',
      };

      const job = { id: '1', data: jobData } as Job<PasswordResetJobData>;

      await processor.handlePasswordReset(job);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.userId).toBe('me');
      expect(callArgs.requestBody.raw).toBeDefined();

      // Decode raw message to verify headers
      const raw = callArgs.requestBody.raw;
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      expect(decoded).toContain('To: guru@school.id');
      expect(decoded).toContain('From: Teman Sekolah <noreply@school.id>');
    });
  });

  // ─── send-password-changed-confirmation ──────────────────────────────────

  describe('handlePasswordChangedConfirmation', () => {
    it('should send confirmation email when password has been changed', async () => {
      const jobData: PasswordChangedConfirmationJobData = {
        to: 'admin@school.id',
        name: 'Admin Sekolah',
      };

      const job = { id: '2', data: jobData } as Job<PasswordChangedConfirmationJobData>;

      await processor.handlePasswordChangedConfirmation(job);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.userId).toBe('me');

      const decoded = Buffer.from(callArgs.requestBody.raw, 'base64').toString('utf-8');
      expect(decoded).toContain('To: admin@school.id');
    });
  });

  // ─── send-user-credentials ───────────────────────────────────────────────

  describe('handleUserCredentials', () => {
    it('should send credentials email with password and role for a new user', async () => {
      const jobData: UserCredentialsJobData = {
        to: 'guru.baru@school.id',
        name: 'Ibu Sari',
        password: 'TempP@ss123',
        role: 'guru',
      };

      const job = { id: '3', data: jobData } as Job<UserCredentialsJobData>;

      await processor.handleUserCredentials(job);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0][0];

      const decoded = Buffer.from(callArgs.requestBody.raw, 'base64').toString('utf-8');
      expect(decoded).toContain('To: guru.baru@school.id');
    });
  });

  // ─── send-tenant-credentials ─────────────────────────────────────────────

  describe('handleTenantCredentials', () => {
    it('should send tenant admin credentials with school name and login details', async () => {
      const jobData: TenantCredentialsJobData = {
        to: 'admin@sdharapan.sch.id',
        tenantName: 'SD Harapan Bangsa',
        adminName: 'Pak Ahmad',
        email: 'admin@sdharapan.sch.id',
        password: 'InitP@ss456',
      };

      const job = { id: '4', data: jobData } as Job<TenantCredentialsJobData>;

      await processor.handleTenantCredentials(job);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0][0];

      const decoded = Buffer.from(callArgs.requestBody.raw, 'base64').toString('utf-8');
      expect(decoded).toContain('To: admin@sdharapan.sch.id');
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should propagate Gmail API errors so Bull can retry the job', async () => {
      mockSend.mockRejectedValueOnce(new Error('Gmail API: unauthorized'));

      const jobData: PasswordResetJobData = {
        to: 'test@example.com',
        name: 'Test User',
        resetUrl: 'https://app.school.id/reset?token=xyz',
      };

      const job = { id: '5', data: jobData } as Job<PasswordResetJobData>;

      await expect(processor.handlePasswordReset(job)).rejects.toThrow('Gmail API: unauthorized');
    });
  });

  // ─── Email Template content validation ───────────────────────────────────

  describe('emailTemplates', () => {
    it('buildPasswordResetHtml should contain the reset URL as a link', () => {
      const html = emailTemplates.buildPasswordResetHtml('Test', 'https://example.com/reset');
      expect(html).toContain('href="https://example.com/reset"');
      expect(html).toContain('Test');
    });

    it('buildPasswordChangedHtml should contain security warning', () => {
      const html = emailTemplates.buildPasswordChangedHtml('Test');
      expect(html).toContain('berhasil diubah');
      expect(html).toContain('hubungi administrator');
    });

    it('buildUserCredentialsHtml should include password and role', () => {
      const html = emailTemplates.buildUserCredentialsHtml('Test', 'abc123', 'bendahara');
      expect(html).toContain('abc123');
      expect(html).toContain('bendahara');
      expect(html).toContain('mengubah password');
    });

    it('buildTenantCredentialsHtml should include all credential details', () => {
      const html = emailTemplates.buildTenantCredentialsHtml(
        'SD Maju',
        'Admin',
        'admin@sd.com',
        'pass123',
      );
      expect(html).toContain('SD Maju');
      expect(html).toContain('Admin');
      expect(html).toContain('admin@sd.com');
      expect(html).toContain('pass123');
    });
  });

  // ─── Property-Based Tests ────────────────────────────────────────────────

  // Feature: user-password-reset, Property 4: Template email admin-reset mengandung semua elemen wajib
  describe('Property 4: buildAdminPasswordResetHtml mengandung semua elemen wajib', () => {
    it('should always contain name, password, login instruction, and admin warning for any valid input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 12, maxLength: 20 }),
          (name, password) => {
            const html = emailTemplates.buildAdminPasswordResetHtml(name, password);

            // Template harus mengandung nama user
            expect(html).toContain(name);

            // Template harus mengandung password sementara
            expect(html).toContain(password);

            // Template harus mengandung instruksi login
            expect(html.toLowerCase()).toContain('login');

            // Template harus mengandung teks peringatan bahwa aksi dilakukan oleh administrator
            expect(html.toLowerCase()).toMatch(/administrator|admin/);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import {
  EmailProcessor,
  PasswordResetJobData,
  PasswordChangedConfirmationJobData,
  UserCredentialsJobData,
  TenantCredentialsJobData,
  emailTemplates,
} from './email.processor';

// Mock nodemailer
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: (...args: unknown[]) => mockSendMail(...args),
  }),
}));

describe('EmailProcessor', () => {
  let processor: EmailProcessor;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        SMTP_HOST: 'smtp.test.com',
        SMTP_PORT: 587,
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'noreply@school.id',
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
    it('should send password reset email with correct recipient, subject, and HTML containing resetUrl', async () => {
      const jobData: PasswordResetJobData = {
        to: 'guru@school.id',
        name: 'Pak Budi',
        resetUrl: 'https://app.school.id/reset-password?token=abc123',
      };

      const job = { id: '1', data: jobData } as Job<PasswordResetJobData>;

      await processor.handlePasswordReset(job);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('noreply@school.id');
      expect(callArgs.to).toBe('guru@school.id');
      expect(callArgs.subject).toContain('Reset Password');
      expect(callArgs.html).toContain('Pak Budi');
      expect(callArgs.html).toContain('https://app.school.id/reset-password?token=abc123');
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

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('noreply@school.id');
      expect(callArgs.to).toBe('admin@school.id');
      expect(callArgs.subject).toContain('Password Berhasil Diubah');
      expect(callArgs.html).toContain('Admin Sekolah');
      expect(callArgs.html).toContain('berhasil diubah');
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

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('noreply@school.id');
      expect(callArgs.to).toBe('guru.baru@school.id');
      expect(callArgs.subject).toContain('Akun Baru');
      expect(callArgs.html).toContain('Ibu Sari');
      expect(callArgs.html).toContain('TempP@ss123');
      expect(callArgs.html).toContain('guru');
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

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('noreply@school.id');
      expect(callArgs.to).toBe('admin@sdharapan.sch.id');
      expect(callArgs.subject).toContain('SD Harapan Bangsa');
      expect(callArgs.html).toContain('Pak Ahmad');
      expect(callArgs.html).toContain('admin@sdharapan.sch.id');
      expect(callArgs.html).toContain('InitP@ss456');
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should propagate SMTP errors so Bull can retry the job', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const jobData: PasswordResetJobData = {
        to: 'test@example.com',
        name: 'Test User',
        resetUrl: 'https://app.school.id/reset?token=xyz',
      };

      const job = { id: '5', data: jobData } as Job<PasswordResetJobData>;

      await expect(processor.handlePasswordReset(job)).rejects.toThrow('SMTP connection refused');
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
});

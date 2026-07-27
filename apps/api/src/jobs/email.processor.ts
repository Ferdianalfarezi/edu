import { Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { google } from 'googleapis';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { BaseProcessor } from './base.processor';

// ─── Job Payloads ───────────────────────────────────────────────────────────

export interface PasswordResetJobData {
  to: string;
  name: string;
  resetUrl: string;
}

export interface PasswordChangedConfirmationJobData {
  to: string;
  name: string;
}

export interface UserCredentialsJobData {
  to: string;
  name: string;
  password: string;
  role: string;
}

export interface TenantCredentialsJobData {
  to: string;
  tenantName: string;
  adminName: string;
  email: string;
  password: string;
}

// ─── Email Templates ────────────────────────────────────────────────────────

function buildPasswordResetHtml(name: string, resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Reset Password</h2>
  <p>Halo ${name},</p>
  <p>Kami menerima permintaan untuk mereset password akun Anda. Klik tombol di bawah untuk membuat password baru:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
  </p>
  <p style="font-size: 14px; color: #666;">Link ini berlaku selama 30 menit. Jika Anda tidak meminta reset password, abaikan email ini.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">Email ini dikirim secara otomatis oleh Sistem Manajemen Sekolah.</p>
</body>
</html>`.trim();
}

function buildPasswordChangedHtml(name: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Password Berhasil Diubah</h2>
  <p>Halo ${name},</p>
  <p>Password akun Anda telah berhasil diubah. Jika Anda tidak melakukan perubahan ini, segera hubungi administrator sekolah Anda.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">Email ini dikirim secara otomatis oleh Sistem Manajemen Sekolah.</p>
</body>
</html>`.trim();
}

function buildUserCredentialsHtml(name: string, password: string, role: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Akun Anda Telah Dibuat</h2>
  <p>Halo ${name},</p>
  <p>Akun Anda telah berhasil dibuat di Sistem Manajemen Sekolah dengan role <strong>${role}</strong>.</p>
  <p>Berikut adalah kredensial login Anda:</p>
  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 4px 0;"><strong>Password:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
  </div>
  <p><strong>Penting:</strong> Anda akan diminta untuk mengubah password saat login pertama kali.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">Email ini dikirim secara otomatis oleh Sistem Manajemen Sekolah.</p>
</body>
</html>`.trim();
}

function buildTenantCredentialsHtml(
  tenantName: string,
  adminName: string,
  email: string,
  password: string,
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Selamat Datang di Sistem Manajemen Sekolah</h2>
  <p>Halo ${adminName},</p>
  <p>Sekolah <strong>${tenantName}</strong> telah berhasil didaftarkan di platform kami. Anda telah ditunjuk sebagai administrator sekolah.</p>
  <p>Berikut adalah kredensial login Anda:</p>
  <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 4px 0;"><strong>Email:</strong> ${email}</p>
    <p style="margin: 4px 0;"><strong>Password:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
  </div>
  <p><strong>Penting:</strong> Anda akan diminta untuk mengubah password saat login pertama kali.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">Email ini dikirim secara otomatis oleh Sistem Manajemen Sekolah.</p>
</body>
</html>`.trim();
}

// ─── Exported template builders for testing ──────────────────────────────────

export const emailTemplates = {
  buildPasswordResetHtml,
  buildPasswordChangedHtml,
  buildUserCredentialsHtml,
  buildTenantCredentialsHtml,
};

// ─── Gmail API Helper ───────────────────────────────────────────────────────

/**
 * Build a raw RFC 2822 email message encoded in base64url format.
 * Gmail API requires this format for sending messages.
 */
function buildRawEmail(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): string {
  const boundary = `boundary_${Date.now()}`;
  const messageParts = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(options.html).toString('base64'),
    '',
    `--${boundary}--`,
  ];

  const rawMessage = messageParts.join('\r\n');
  // Gmail API expects base64url encoding (no padding, URL-safe chars)
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EMAIL)
@Injectable()
export class EmailProcessor extends BaseProcessor {
  private readonly processorLogger = new Logger(EmailProcessor.name);
  private gmail: ReturnType<typeof google.gmail> | null = null;
  private senderEmail: string;

  constructor(private readonly configService: ConfigService) {
    super('EmailProcessor', { concurrency: 3, maxAttempts: 3 });

    this.senderEmail = this.configService.get<string>('GMAIL_SENDER_EMAIL', 'noreply@example.com');

    this.initializeGmailClient();
  }

  /**
   * Initialize Gmail API client with Service Account + domain-wide delegation.
   * The service account impersonates GMAIL_SENDER_EMAIL to send emails via HTTPS.
   */
  private initializeGmailClient(): void {
    const serviceAccountEmail = this.configService.get<string>('GMAIL_SERVICE_ACCOUNT_EMAIL');
    const serviceAccountKeyRaw = this.configService.get<string>('GMAIL_SERVICE_ACCOUNT_KEY');

    if (!serviceAccountEmail || !serviceAccountKeyRaw) {
      this.processorLogger.warn(
        'Gmail Service Account credentials not configured. Email sending will fail.',
      );
      return;
    }

    try {
      // Parse the private key from the service account JSON
      let privateKey: string;
      try {
        const keyData = JSON.parse(serviceAccountKeyRaw);
        privateKey = keyData.private_key;
      } catch {
        // If it's not a full JSON, treat it as the private key directly
        privateKey = serviceAccountKeyRaw;
      }

      const auth = new google.auth.JWT({
        email: serviceAccountEmail,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/gmail.send'],
        subject: this.senderEmail, // Impersonate this user
      });

      this.gmail = google.gmail({ version: 'v1', auth });
      this.processorLogger.log(`Gmail API client initialized (sender: ${this.senderEmail})`);
    } catch (error) {
      this.processorLogger.error(
        `Failed to initialize Gmail API client: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Send an email using Gmail API (HTTPS, no SMTP port needed).
   */
  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.gmail) {
      throw new Error(
        'Gmail API client not initialized. Check GMAIL_SERVICE_ACCOUNT_EMAIL and GMAIL_SERVICE_ACCOUNT_KEY env vars.',
      );
    }

    const raw = buildRawEmail({
      from: `Teman Sekolah <${this.senderEmail}>`,
      to,
      subject,
      html,
    });

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
  }

  @Process('send-password-reset')
  async handlePasswordReset(job: Job<PasswordResetJobData>): Promise<void> {
    const { to, name, resetUrl } = job.data;

    await this.sendEmail(
      to,
      'Reset Password - Sistem Manajemen Sekolah',
      buildPasswordResetHtml(name, resetUrl),
    );

    this.processorLogger.log(`Password reset email sent to ${to}`);
  }

  @Process('send-password-changed-confirmation')
  async handlePasswordChangedConfirmation(
    job: Job<PasswordChangedConfirmationJobData>,
  ): Promise<void> {
    const { to, name } = job.data;

    await this.sendEmail(
      to,
      'Password Berhasil Diubah - Sistem Manajemen Sekolah',
      buildPasswordChangedHtml(name),
    );

    this.processorLogger.log(`Password changed confirmation email sent to ${to}`);
  }

  @Process('send-user-credentials')
  async handleUserCredentials(job: Job<UserCredentialsJobData>): Promise<void> {
    const { to, name, password, role } = job.data;

    await this.sendEmail(
      to,
      'Akun Baru Anda - Sistem Manajemen Sekolah',
      buildUserCredentialsHtml(name, password, role),
    );

    this.processorLogger.log(`User credentials email sent to ${to} (role: ${role})`);
  }

  @Process('send-tenant-credentials')
  async handleTenantCredentials(job: Job<TenantCredentialsJobData>): Promise<void> {
    const { to, tenantName, adminName, email, password } = job.data;

    await this.sendEmail(
      to,
      `Selamat Datang - ${tenantName} - Sistem Manajemen Sekolah`,
      buildTenantCredentialsHtml(tenantName, adminName, email, password),
    );

    this.processorLogger.log(`Tenant credentials email sent to ${to} for ${tenantName}`);
  }
}

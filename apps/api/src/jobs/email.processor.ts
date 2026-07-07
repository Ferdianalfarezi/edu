import { Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
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

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EMAIL)
@Injectable()
export class EmailProcessor extends BaseProcessor {
  private readonly processorLogger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter;
  private fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    super('EmailProcessor', { concurrency: 3, maxAttempts: 3 });

    this.fromAddress = this.configService.get<string>('SMTP_FROM', 'noreply@example.com');
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<number>('SMTP_PORT') === 465,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  @Process('send-password-reset')
  async handlePasswordReset(job: Job<PasswordResetJobData>): Promise<void> {
    const { to, name, resetUrl } = job.data;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Reset Password - Sistem Manajemen Sekolah',
      html: buildPasswordResetHtml(name, resetUrl),
    });

    this.processorLogger.log(`Password reset email sent to ${to}`);
  }

  @Process('send-password-changed-confirmation')
  async handlePasswordChangedConfirmation(
    job: Job<PasswordChangedConfirmationJobData>,
  ): Promise<void> {
    const { to, name } = job.data;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Password Berhasil Diubah - Sistem Manajemen Sekolah',
      html: buildPasswordChangedHtml(name),
    });

    this.processorLogger.log(`Password changed confirmation email sent to ${to}`);
  }

  @Process('send-user-credentials')
  async handleUserCredentials(job: Job<UserCredentialsJobData>): Promise<void> {
    const { to, name, password, role } = job.data;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Akun Baru Anda - Sistem Manajemen Sekolah',
      html: buildUserCredentialsHtml(name, password, role),
    });

    this.processorLogger.log(`User credentials email sent to ${to} (role: ${role})`);
  }

  @Process('send-tenant-credentials')
  async handleTenantCredentials(job: Job<TenantCredentialsJobData>): Promise<void> {
    const { to, tenantName, adminName, email, password } = job.data;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: `Selamat Datang - ${tenantName} - Sistem Manajemen Sekolah`,
      html: buildTenantCredentialsHtml(tenantName, adminName, email, password),
    });

    this.processorLogger.log(`Tenant credentials email sent to ${to} for ${tenantName}`);
  }
}

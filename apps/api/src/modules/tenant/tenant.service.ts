import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql, count } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Queue } from 'bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { tenant } from '@/drizzle/schema/tenant';
import { user } from '@/drizzle/schema/user';
import { siswa } from '@/drizzle/schema/siswa';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { AuthService } from '@/modules/auth/auth.service';
import { QUEUE_NAMES } from '@/modules/queue';
import { CreateTenantDto, UpdateTenantDto } from './dto';

const BCRYPT_SALT_ROUNDS = 10;
const GENERATED_PASSWORD_LENGTH = 12;

export interface TenantWithStats {
  id: string;
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  logoUrl: string | null;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  userCount: number;
}

export interface CreateTenantResult {
  tenant: {
    id: string;
    nama: string;
    email: string | null;
  };
  admin: {
    id: string;
    email: string | null;
    nama: string;
  };
}

export interface TenantStats {
  total_users: number;
  total_students: number;
  total_classes: number;
  total_teachers: number;
  active_tahun_ajaran: string | null;
}

@Injectable()
export class TenantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly authService: AuthService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  /**
   * Get stats for a specific tenant (scoped to the current user's tenant).
   */
  async getTenantStats(tenantId: string): Promise<TenantStats> {
    // Count active users in this tenant
    const [userCountResult] = await this.db
      .select({ count: count(user.id) })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.isActive, true)));

    // Count active students in this tenant
    const [studentCountResult] = await this.db
      .select({ count: count(siswa.id) })
      .from(siswa)
      .where(and(eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')));

    // Count classes in this tenant
    const [classCountResult] = await this.db
      .select({ count: count(kelas.id) })
      .from(kelas)
      .where(eq(kelas.tenantId, tenantId));

    // Count teachers (guru role) in this tenant
    const [teacherCountResult] = await this.db
      .select({ count: count(user.id) })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.role, 'guru'), eq(user.isActive, true)));

    // Get active tahun ajaran name
    const activeTahunAjaran = await this.db
      .select({ nama: tahunAjaran.nama })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')))
      .limit(1);

    return {
      total_users: Number(userCountResult.count),
      total_students: Number(studentCountResult.count),
      total_classes: Number(classCountResult.count),
      total_teachers: Number(teacherCountResult.count),
      active_tahun_ajaran: activeTahunAjaran.length > 0 ? activeTahunAjaran[0].nama : null,
    };
  }

  /**
   * Create a new tenant with a default admin user.
   * Generates a random password for the admin and enqueues a credentials email.
   */
  async createTenant(dto: CreateTenantDto): Promise<CreateTenantResult> {
    // Check if admin email is already used
    const existingUsers = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, dto.admin_email))
      .limit(1);

    if (existingUsers.length > 0) {
      throw new BadRequestException(`Email ${dto.admin_email} sudah digunakan oleh user lain`);
    }

    // Create tenant
    const [newTenant] = await this.db
      .insert(tenant)
      .values({
        nama: dto.nama,
        alamat: dto.alamat ?? null,
        telepon: dto.telepon ?? null,
        email: dto.email,
        isActive: true,
      })
      .returning();

    // Generate random password for default admin
    const rawPassword = this.generateRandomPassword();
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

    // Create default admin user for this tenant
    const [adminUser] = await this.db
      .insert(user)
      .values({
        tenantId: newTenant.id,
        nama: dto.admin_nama,
        email: dto.admin_email,
        passwordHash,
        role: 'admin',
        isActive: true,
        mustChangePassword: true,
      })
      .returning();

    // Enqueue credentials email
    await this.emailQueue.add('send-tenant-credentials', {
      to: dto.admin_email,
      tenantName: dto.nama,
      adminName: dto.admin_nama,
      email: dto.admin_email,
      password: rawPassword,
    });

    return {
      tenant: {
        id: newTenant.id,
        nama: newTenant.nama,
        email: newTenant.email,
      },
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        nama: adminUser.nama,
      },
    };
  }

  /**
   * Deactivate a tenant: set is_active = false and invalidate all user tokens.
   */
  async deactivateTenant(tenantId: string): Promise<{ message: string }> {
    // Verify tenant exists
    const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    const existingTenant = tenants[0];

    if (!existingTenant.isActive) {
      throw new BadRequestException('Tenant sudah nonaktif');
    }

    // Deactivate tenant
    await this.db
      .update(tenant)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(tenant.id, tenantId));

    // Invalidate all tokens for users in this tenant
    await this.authService.invalidateAllTenantTokens(tenantId);

    return { message: `Tenant "${existingTenant.nama}" berhasil dinonaktifkan` };
  }

  /**
   * Reactivate a previously deactivated tenant.
   */
  async activateTenant(tenantId: string): Promise<{ message: string }> {
    const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    const existingTenant = tenants[0];

    if (existingTenant.isActive) {
      throw new BadRequestException('Tenant sudah aktif');
    }

    await this.db
      .update(tenant)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(tenant.id, tenantId));

    return { message: `Tenant "${existingTenant.nama}" berhasil diaktifkan kembali` };
  }

  /**
   * Update tenant details (nama, alamat, telepon, email).
   */
  async updateTenant(tenantId: string, dto: UpdateTenantDto): Promise<{ message: string }> {
    const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.alamat !== undefined) updateData.alamat = dto.alamat;
    if (dto.telepon !== undefined) updateData.telepon = dto.telepon;
    if (dto.email !== undefined) updateData.email = dto.email;

    await this.db.update(tenant).set(updateData).where(eq(tenant.id, tenantId));

    return { message: 'Tenant berhasil diperbarui' };
  }

  /**
   * List all tenants with basic stats (user count).
   */
  async listTenants(): Promise<TenantWithStats[]> {
    const results = await this.db
      .select({
        id: tenant.id,
        nama: tenant.nama,
        alamat: tenant.alamat,
        telepon: tenant.telepon,
        email: tenant.email,
        logoUrl: tenant.logoUrl,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        userCount: count(user.id),
      })
      .from(tenant)
      .leftJoin(user, and(eq(user.tenantId, tenant.id), eq(user.isActive, true)))
      .groupBy(tenant.id)
      .orderBy(tenant.createdAt);

    return results.map((r) => ({
      ...r,
      userCount: Number(r.userCount),
    }));
  }

  /**
   * Generate a random password of configurable length.
   * Includes uppercase, lowercase, digits, and special characters.
   */
  private generateRandomPassword(): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    const bytes = crypto.randomBytes(GENERATED_PASSWORD_LENGTH);
    let password = '';
    for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
      password += charset[bytes[i] % charset.length];
    }
    return password;
  }
}

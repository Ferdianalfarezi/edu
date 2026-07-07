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
import { AuthService } from '@/modules/auth/auth.service';
import { QUEUE_NAMES } from '@/modules/queue';
import { CreateTenantDto } from './dto';

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

@Injectable()
export class TenantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly authService: AuthService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

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

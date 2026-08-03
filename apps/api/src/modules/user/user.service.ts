import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, ilike, or, gt, asc, sql, inArray, count } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Queue } from 'bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { user } from '@/drizzle/schema/user';
import { tenant } from '@/drizzle/schema/tenant';
import { jadwalPelajaran } from '@/drizzle/schema/jadwal';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { QUEUE_NAMES } from '@/modules/queue';
import { Role } from '@edu/shared';
import { CreateUserDto, UpdateUserDto, ListUsersQueryDto } from './dto';
import { paginate } from '@/common/utils/paginate';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';

const BCRYPT_SALT_ROUNDS = 10;
const DEFAULT_PAGE_SIZE = 20;

export interface BulkImportResult {
  created: number;
  skipped: { email: string; reason: string }[];
  total: number;
}

export interface ParsedCsvRow {
  nama: string;
  email: string;
  role: string;
}

export interface VacantJadwalSlot {
  id: string;
  kelasId: string;
  mataPelajaranId: string | null;
  hari: string;
  jamKe: number;
  semester: number;
  tahunAjaranId: string;
}

export interface RemovedWaliKelas {
  kelasId: string;
  kelasNama: string;
  tahunAjaranId: string;
}

export interface DeactivateGuruResult {
  deactivatedUser: { id: string; nama: string; email: string | null; isActive: boolean | null };
  vacantJadwalSlots: VacantJadwalSlot[];
  removedWaliKelas: RemovedWaliKelas[];
  message: string;
}

@Injectable()
export class UserService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  // ─── Create User ──────────────────────────────────────────────

  async createUser(tenantId: string, dto: CreateUserDto) {
    // Validate email uniqueness per tenant
    await this.validateEmailUniqueness(dto.email, tenantId);

    // In development, use a fixed password for easy testing
    const rawPassword =
      process.env.NODE_ENV === 'development' ? 'password123' : this.generateRandomPassword();
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

    // Insert user
    const [created] = await this.db
      .insert(user)
      .values({
        tenantId,
        nama: dto.nama,
        email: dto.email,
        phone: dto.phone || null,
        passwordHash,
        role: dto.role,
        isActive: true,
        mustChangePassword: true,
      })
      .returning();

    // Enqueue welcome email with credentials
    await this.emailQueue.add('send-user-credentials', {
      to: dto.email,
      name: dto.nama,
      password: rawPassword,
      role: dto.role,
    });

    return {
      id: created.id,
      nama: created.nama,
      email: created.email,
      phone: created.phone,
      role: created.role,
      isActive: created.isActive,
      mustChangePassword: created.mustChangePassword,
      createdAt: created.createdAt,
    };
  }

  // ─── List Users (cursor paginated) ────────────────────────────

  async listUsers(tenantId: string, query: ListUsersQueryDto) {
    const conditions = [eq(user.tenantId, tenantId)];

    // Filter by active status (defaults to active-only for backwards compatibility)
    if (query.is_active === 'false') {
      conditions.push(eq(user.isActive, false));
    } else if (query.is_active === 'all') {
      // No isActive filter — show all
    } else {
      // Default: only active users
      conditions.push(eq(user.isActive, true));
    }

    // Filter by role
    if (query.role) {
      conditions.push(eq(user.role, query.role));
    }

    // Search by name or email — escape LIKE wildcards in search term
    if (query.search) {
      const escapedSearch = query.search.replace(/[%_\\]/g, '\\$&');
      conditions.push(
        or(ilike(user.nama, `%${escapedSearch}%`), ilike(user.email, `%${escapedSearch}%`))!,
      );
    }

    // Cursor pagination (id-based, ascending order)
    if (query.cursor) {
      conditions.push(gt(user.id, query.cursor));
    }

    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(and(...conditions))
      .orderBy(asc(user.id))
      .limit(DEFAULT_PAGE_SIZE + 1);

    const hasNext = results.length > DEFAULT_PAGE_SIZE;
    const data = hasNext ? results.slice(0, DEFAULT_PAGE_SIZE) : results;
    const nextCursor = hasNext ? data[data.length - 1].id : null;

    return {
      data: data.map((u) => ({
        id: u.id,
        nama: u.nama,
        email: u.email,
        phone: u.phone,
        role: u.role,
        is_active: u.isActive,
        must_change_password: u.mustChangePassword,
        created_at: u.createdAt,
      })),
      meta: {
        has_next: hasNext,
        cursor: nextCursor,
      },
    };
  }

  // ─── List Users Cross-Tenant (SUPER_ADMIN) ────────────────────

  async listUsersCrossTenant(
    page: number,
    pageSize: number,
    search?: string,
    tenantId?: string,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const conditions: ReturnType<typeof eq>[] = [];

    // Scope to tenant if context is set
    if (tenantId) {
      conditions.push(eq(user.tenantId, tenantId));
    }

    // Search across email, nama, phone (min 3 chars enforced at DTO level)
    if (search) {
      const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
      conditions.push(
        or(
          ilike(user.nama, `%${escapedSearch}%`),
          ilike(user.email, `%${escapedSearch}%`),
          ilike(user.phone, `%${escapedSearch}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await this.db.select({ total: count() }).from(user).where(whereClause);

    const totalCount = Number(countResult?.total ?? 0);

    // Get paginated results with tenant name via LEFT JOIN
    const offset = (page - 1) * pageSize;
    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        tenantId: user.tenantId,
        tenantNama: tenant.nama,
        createdAt: user.createdAt,
      })
      .from(user)
      .leftJoin(tenant, eq(user.tenantId, tenant.id))
      .where(whereClause)
      .orderBy(asc(user.createdAt))
      .limit(pageSize)
      .offset(offset);

    const data = results.map((r) => ({
      id: r.id,
      nama: r.nama,
      email: r.email,
      phone: r.phone,
      role: r.role,
      is_active: r.isActive,
      tenant_id: r.tenantId,
      tenant_nama: r.tenantNama,
      created_at: r.createdAt,
    }));

    return paginate(data, totalCount, page, pageSize);
  }

  // ─── Get Single User ──────────────────────────────────────────

  async getUserById(tenantId: string, userId: string) {
    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('User tidak ditemukan');
    }

    return results[0];
  }

  // ─── Update User ──────────────────────────────────────────────

  async updateUser(tenantId: string, userId: string, dto: UpdateUserDto) {
    // Verify user exists in this tenant
    const existing = await this.getUserById(tenantId, userId);

    // If email is being changed, validate uniqueness
    if (dto.email && dto.email !== existing.email) {
      await this.validateEmailUniqueness(dto.email, tenantId, userId);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.role !== undefined) updateData.role = dto.role;

    const [updated] = await this.db
      .update(user)
      .set(updateData)
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .returning();

    return {
      id: updated.id,
      nama: updated.nama,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── Update User Role (SUPER_ADMIN only) ───────────────────────

  async updateUserRole(userId: string, newRole: string) {
    // Reject SUPER_ADMIN assignment
    if (newRole === Role.SUPER_ADMIN) {
      throw new BadRequestException('Role super_admin tidak dapat diberikan ke user');
    }

    // Find user regardless of tenant (cross-tenant operation)
    const [existing] = await this.db.select().from(user).where(eq(user.id, userId)).limit(1);

    if (!existing) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const [updated] = await this.db
      .update(user)
      .set({ role: newRole as Role, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning();

    return {
      id: updated.id,
      nama: updated.nama,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      isActive: updated.isActive,
      tenant_id: updated.tenantId,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── Deactivate User ──────────────────────────────────────────

  async deactivateUser(tenantId: string, userId: string) {
    // Verify user exists
    await this.getUserById(tenantId, userId);

    // Deactivate and invalidate tokens
    const [deactivated] = await this.db
      .update(user)
      .set({
        isActive: false,
        tokensInvalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .returning();

    return {
      id: deactivated.id,
      nama: deactivated.nama,
      isActive: deactivated.isActive,
    };
  }

  // ─── Superadmin: Deactivate User (cross-tenant) ────────────────

  async superadminDeactivateUser(userId: string) {
    // Find user by ID without tenant scoping
    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        isActive: user.isActive,
        tenantId: user.tenantId,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (results[0].isActive === false) {
      throw new BadRequestException('User sudah dalam status nonaktif');
    }

    // Deactivate and invalidate tokens
    const [deactivated] = await this.db
      .update(user)
      .set({
        isActive: false,
        tokensInvalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .returning();

    return {
      id: deactivated.id,
      nama: deactivated.nama,
      isActive: deactivated.isActive,
    };
  }

  // ─── Superadmin: Activate User (cross-tenant) ─────────────────

  async superadminActivateUser(userId: string) {
    // Find user by ID without tenant scoping
    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        isActive: user.isActive,
        tenantId: user.tenantId,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (results[0].isActive === true) {
      throw new BadRequestException('User sudah aktif');
    }

    // Activate user
    const [activated] = await this.db
      .update(user)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .returning();

    return {
      id: activated.id,
      nama: activated.nama,
      isActive: activated.isActive,
    };
  }

  // ─── Deactivate Guru (with jadwal cleanup) ────────────────────

  async deactivateGuru(tenantId: string, userId: string): Promise<DeactivateGuruResult> {
    // 1. Verify user exists and is a guru
    const existingUser = await this.getUserById(tenantId, userId);
    if (existingUser.role !== Role.GURU) {
      throw new BadRequestException('User bukan guru. Gunakan endpoint deactivate biasa.');
    }

    // 2. Deactivate user and invalidate tokens (reuse existing method)
    const deactivated = await this.deactivateUser(tenantId, userId);

    // 3. Find all active jadwal_pelajaran for this guru in current/future tahun_ajaran
    const activeJadwal = await this.findActiveJadwalForGuru(tenantId, userId);

    // 4. Mark affected jadwal slots as vacant
    const vacantSlots: VacantJadwalSlot[] = [];
    if (activeJadwal.length > 0) {
      const jadwalIds = activeJadwal.map((j) => j.id);

      await this.db
        .update(jadwalPelajaran)
        .set({ isVacant: true, updatedAt: new Date() })
        .where(inArray(jadwalPelajaran.id, jadwalIds));

      vacantSlots.push(
        ...activeJadwal.map((j) => ({
          id: j.id,
          kelasId: j.kelasId,
          mataPelajaranId: j.mataPelajaranId,
          hari: j.hari,
          jamKe: j.jamKe,
          semester: j.semester,
          tahunAjaranId: j.tahunAjaranId,
        })),
      );
    }

    // 5. Find all kelas where this guru is wali_kelas (in active/disiapkan tahun_ajaran)
    const waliKelasEntries = await this.findWaliKelasForGuru(tenantId, userId);

    // 6. Remove wali_kelas assignment
    const removedWaliKelas: RemovedWaliKelas[] = [];
    if (waliKelasEntries.length > 0) {
      const kelasIds = waliKelasEntries.map((k) => k.kelasId);

      await this.db
        .update(kelas)
        .set({ waliKelasId: null, updatedAt: new Date() })
        .where(inArray(kelas.id, kelasIds));

      removedWaliKelas.push(
        ...waliKelasEntries.map((k) => ({
          kelasId: k.kelasId,
          kelasNama: k.kelasNama,
          tahunAjaranId: k.tahunAjaranId,
        })),
      );
    }

    // 7. Build response
    const message =
      `${vacantSlots.length} slot jadwal kosong, silakan assign guru pengganti` +
      (removedWaliKelas.length > 0
        ? `. ${removedWaliKelas.length} kelas kehilangan wali kelas.`
        : '.');

    return {
      deactivatedUser: {
        id: deactivated.id,
        nama: deactivated.nama,
        email: existingUser.email,
        isActive: deactivated.isActive,
      },
      vacantJadwalSlots: vacantSlots,
      removedWaliKelas,
      message,
    };
  }

  // ─── Helper: Find active jadwal for a guru ────────────────────

  async findActiveJadwalForGuru(tenantId: string, guruId: string): Promise<VacantJadwalSlot[]> {
    return this.db
      .select({
        id: jadwalPelajaran.id,
        kelasId: jadwalPelajaran.kelasId,
        mataPelajaranId: jadwalPelajaran.mataPelajaranId,
        hari: jadwalPelajaran.hari,
        jamKe: jadwalPelajaran.jamKe,
        semester: jadwalPelajaran.semester,
        tahunAjaranId: jadwalPelajaran.tahunAjaranId,
      })
      .from(jadwalPelajaran)
      .innerJoin(tahunAjaran, eq(jadwalPelajaran.tahunAjaranId, tahunAjaran.id))
      .where(
        and(
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.isVacant, false),
          inArray(tahunAjaran.status, ['aktif', 'disiapkan']),
        ),
      );
  }

  // ─── Helper: Find wali kelas assignments for a guru ───────────

  async findWaliKelasForGuru(
    tenantId: string,
    guruId: string,
  ): Promise<{ kelasId: string; kelasNama: string; tahunAjaranId: string }[]> {
    return this.db
      .select({
        kelasId: kelas.id,
        kelasNama: kelas.nama,
        tahunAjaranId: kelas.tahunAjaranId,
      })
      .from(kelas)
      .innerJoin(tahunAjaran, eq(kelas.tahunAjaranId, tahunAjaran.id))
      .where(
        and(
          eq(kelas.waliKelasId, guruId),
          eq(kelas.tenantId, tenantId),
          inArray(tahunAjaran.status, ['aktif', 'disiapkan']),
        ),
      );
  }

  // ─── Bulk Import (CSV) ────────────────────────────────────────

  async bulkImportUsers(tenantId: string, csvContent: string): Promise<BulkImportResult> {
    const rows = this.parseCsv(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('File CSV kosong atau format tidak valid');
    }

    const validRoles = [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA];
    const skipped: { email: string; reason: string }[] = [];

    // Pre-validate all rows
    const validRows: ParsedCsvRow[] = [];
    for (const row of rows) {
      if (!row.email || !this.isValidEmail(row.email)) {
        skipped.push({ email: row.email || '(kosong)', reason: 'Format email tidak valid' });
        continue;
      }
      if (!row.nama || row.nama.trim().length === 0) {
        skipped.push({ email: row.email, reason: 'Nama tidak boleh kosong' });
        continue;
      }
      if (!validRoles.includes(row.role as Role)) {
        skipped.push({
          email: row.email,
          reason: `Role tidak valid: "${row.role}". Harus salah satu dari: ${validRoles.join(', ')}`,
        });
        continue;
      }
      validRows.push({
        nama: row.nama.trim(),
        email: row.email.trim().toLowerCase(),
        role: row.role as Role,
      });
    }

    if (validRows.length === 0) {
      return { created: 0, skipped, total: rows.length };
    }

    // Batch check email uniqueness — single query instead of N queries
    const emailsToCheck = validRows.map((r) => r.email);
    const existingUsers = await this.db
      .select({ email: user.email })
      .from(user)
      .where(and(inArray(user.email, emailsToCheck), eq(user.tenantId, tenantId)));

    const existingEmailSet = new Set(existingUsers.map((u) => u.email));

    // Separate into creatable vs duplicate
    const creatableRows: ParsedCsvRow[] = [];
    for (const row of validRows) {
      if (existingEmailSet.has(row.email)) {
        skipped.push({ email: row.email, reason: 'Email sudah terdaftar' });
      } else {
        creatableRows.push(row);
      }
    }

    if (creatableRows.length === 0) {
      return { created: 0, skipped, total: rows.length };
    }

    // Generate passwords and hash them in parallel
    const userEntries = await Promise.all(
      creatableRows.map(async (row) => {
        const rawPassword =
          process.env.NODE_ENV === 'development' ? 'password123' : this.generateRandomPassword();
        const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);
        return { ...row, rawPassword, passwordHash };
      }),
    );

    // Batch INSERT all users at once
    await this.db.insert(user).values(
      userEntries.map((entry) => ({
        tenantId,
        nama: entry.nama,
        email: entry.email,
        role: entry.role as Role,
        passwordHash: entry.passwordHash,
        isActive: true,
        mustChangePassword: true,
      })),
    );

    // Enqueue all credential emails
    for (const entry of userEntries) {
      await this.emailQueue.add('send-user-credentials', {
        to: entry.email,
        name: entry.nama,
        password: entry.rawPassword,
        role: entry.role,
      });
    }

    return {
      created: creatableRows.length,
      skipped,
      total: rows.length,
    };
  }

  // ─── CSV Parsing ──────────────────────────────────────────────

  parseCsv(content: string): ParsedCsvRow[] {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return []; // Need at least header + 1 data row
    }

    // Parse header to identify column indices
    const headerCols = this.parseCsvLine(lines[0]);
    const header = headerCols.map((h) => h.toLowerCase().trim());
    const namaIdx = header.findIndex((h) => h === 'nama');
    const emailIdx = header.findIndex((h) => h === 'email');
    const roleIdx = header.findIndex((h) => h === 'role');

    if (namaIdx === -1 || emailIdx === -1) {
      throw new BadRequestException('Format CSV tidak valid. Kolom wajib: nama, email, role');
    }

    const rows: ParsedCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i]);
      rows.push({
        nama: cols[namaIdx] || '',
        email: cols[emailIdx] || '',
        role: (roleIdx !== -1 ? cols[roleIdx] || '' : 'guru').toLowerCase().trim(),
      });
    }

    return rows;
  }

  /**
   * Parse a single CSV line respecting quoted fields.
   * Handles fields with commas inside double quotes (RFC 4180).
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote ("")
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // Skip the next quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current.trim());
    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Generate a random password using crypto.randomBytes.
   * Returns a 12-character alphanumeric string.
   *
   * @deprecated Use `generateSecurePassword()` instead. This method produces
   * base64url characters only (no symbols) and does not guarantee character
   * class coverage. Kept for backwards compatibility with bulk-import flow.
   */
  generateRandomPassword(): string {
    return crypto.randomBytes(9).toString('base64url').slice(0, 12);
  }

  /**
   * Generate a cryptographically secure random password that satisfies all
   * security criteria: at least 1 uppercase letter, 1 lowercase letter,
   * 1 digit, and 1 symbol, with a total length of 12 characters.
   *
   * Uses `crypto.randomInt()` exclusively — never `Math.random()`.
   */
  generateSecurePassword(): string {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const symbols = '!@#$%^&*';
    const all = upper + lower + digits + symbols;

    // Guarantee at least one character from each required class
    const required = [
      upper[crypto.randomInt(upper.length)],
      lower[crypto.randomInt(lower.length)],
      digits[crypto.randomInt(digits.length)],
      symbols[crypto.randomInt(symbols.length)],
    ];

    // Fill remaining 8 characters from the full charset
    const rest = Array.from({ length: 8 }, () => all[crypto.randomInt(all.length)]);

    // Shuffle to avoid predictable positions (e.g. first char always uppercase)
    return [...required, ...rest].sort(() => crypto.randomInt(3) - 1).join('');
  }

  // ─── Reset Password (SUPER_ADMIN) ────────────────────────────

  async resetPassword(callerId: string, callerRole: string, targetId: string) {
    // 1. Validasi self-reset
    if (callerId === targetId) {
      throw new ForbiddenException('Tidak dapat mereset password sendiri');
    }

    // 2. Lookup user target (cross-tenant, no tenant scoping)
    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      })
      .from(user)
      .where(eq(user.id, targetId))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const existingUser = results[0];

    // 3. Validasi target bukan superadmin
    if (existingUser.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Tidak dapat mereset password superadmin');
    }

    // 4. Validasi email target tidak kosong/whitespace
    const email = existingUser.email?.trim();
    if (!email) {
      throw new BadRequestException('User tidak memiliki alamat email');
    }

    // 5. Generate secure temporary password
    const tempPassword = this.generateSecurePassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);

    // 6. Atomically update passwordHash and mustChangePassword in a transaction
    await this.db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          passwordHash,
          mustChangePassword: true,
          updatedAt: new Date(),
        })
        .where(eq(user.id, targetId));
    });

    // 7. Enqueue email — failure must not roll back the reset
    try {
      await this.emailQueue.add('send-admin-password-reset', {
        to: email,
        name: existingUser.nama,
        password: tempPassword,
      });
    } catch (err) {
      // Log but do not re-throw — reset is already committed to DB
      console.error('[UserService] Failed to enqueue admin password reset email', err);
    }

    return { message: 'Password berhasil direset' };
  }

  private async validateEmailUniqueness(
    email: string,
    tenantId: string,
    excludeUserId?: string,
  ): Promise<void> {
    const conditions = [eq(user.email, email), eq(user.tenantId, tenantId)];

    if (excludeUserId) {
      conditions.push(sql`${user.id} != ${excludeUserId}`);
    }

    const existing = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email sudah terdaftar di tenant ini');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

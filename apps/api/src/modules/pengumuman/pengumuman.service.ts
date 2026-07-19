import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, inArray, desc, count } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { pengumuman, pengumumanPenerima } from '@/drizzle/schema/pengumuman';
import { siswa } from '@/drizzle/schema/siswa';
import { user } from '@/drizzle/schema/user';
import { tenant } from '@/drizzle/schema/tenant';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { RequestUser } from '@/modules/auth/interfaces/jwt-payload.interface';
import { paginate } from '@/common/utils/paginate';
import { CreatePengumumanDto, ListPengumumanQueryDto } from './pengumuman.dto';

/**
 * PengumumanService handles creation, listing, and detail retrieval of announcements.
 *
 * - create: validates input, resolves recipients (broadcast/targeted), inserts records, enqueues FCM job
 * - list: paginated listing for admin panel
 * - getDetail: access-controlled detail for orang_tua
 *
 * Requirements: 1.2–1.5, 2.1–2.6, 3.2–3.6, 5.2–5.4, 6.6, 7.2, 7.4–7.6
 */
@Injectable()
export class PengumumanService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {}

  /**
   * Create a new pengumuman, resolve recipients, enqueue notification job.
   *
   * Requirements: 1.2, 1.3, 1.4, 1.5, 2.1–2.6, 3.2–3.6, 7.2, 7.4
   */
  async create(dto: CreatePengumumanDto, currentUser: RequestUser) {
    const tenantId = currentUser.tenant_id;
    if (!tenantId) {
      throw new ForbiddenException('Tenant ID tidak tersedia');
    }

    // Trim and validate lengths
    const judul = dto.judul.trim();
    const deskripsi = dto.deskripsi.trim();

    if (judul.length === 0 || judul.length > 255) {
      throw new BadRequestException('Judul harus antara 1–255 karakter setelah trimming');
    }
    if (deskripsi.length === 0 || deskripsi.length > 5000) {
      throw new BadRequestException('Deskripsi harus antara 1–5000 karakter setelah trimming');
    }

    // Insert pengumuman with status 'draft'
    const [created] = await this.db
      .insert(pengumuman)
      .values({
        tenantId,
        createdBy: currentUser.id,
        judul,
        deskripsi,
        mode: dto.mode,
        status: 'draft',
        jumlahPenerima: 0,
      })
      .returning();

    // Resolve recipients based on mode
    let recipientUserIds: string[];

    if (dto.mode === 'broadcast') {
      recipientUserIds = await this.resolveBroadcastRecipients(tenantId);
    } else {
      recipientUserIds = await this.resolveTargetedRecipients(tenantId, dto.siswa_ids ?? []);
    }

    // Insert pengumuman_penerima records
    if (recipientUserIds.length > 0) {
      const penerimaValues = recipientUserIds.map((userId) => ({
        pengumumanId: created.id,
        userId,
      }));
      await this.db.insert(pengumumanPenerima).values(penerimaValues);
    }

    // Enqueue notification job
    if (recipientUserIds.length > 0) {
      await this.notificationQueue.add('send-pengumuman-notification', {
        pengumuman_id: created.id,
        tenant_id: tenantId,
        judul,
        deskripsi,
        penerima_user_ids: recipientUserIds,
      });
    }

    // Update jumlah_penerima on the pengumuman record
    const jumlahPenerima = recipientUserIds.length;
    await this.db
      .update(pengumuman)
      .set({ jumlahPenerima, updatedAt: new Date() })
      .where(eq(pengumuman.id, created.id));

    return {
      pengumuman_id: created.id,
      judul,
      mode: dto.mode,
      jumlah_penerima: jumlahPenerima,
      status: created.status,
      created_at: created.createdAt,
    };
  }

  /**
   * List pengumuman for a tenant with offset-based pagination.
   *
   * Requirements: 5.2, 5.3, 5.4
   */
  async list(query: ListPengumumanQueryDto, tenantId: string) {
    const page = query.page;
    const pageSize = query.page_size;
    const offset = (page - 1) * pageSize;

    const whereClause = eq(pengumuman.tenantId, tenantId);

    // Count total
    const [countResult] = await this.db
      .select({ count: count() })
      .from(pengumuman)
      .where(whereClause);

    const totalCount = Number(countResult?.count ?? 0);

    // Get paginated data
    const data = await this.db
      .select({
        id: pengumuman.id,
        judul: pengumuman.judul,
        mode: pengumuman.mode,
        jumlahPenerima: pengumuman.jumlahPenerima,
        status: pengumuman.status,
        createdAt: pengumuman.createdAt,
      })
      .from(pengumuman)
      .where(whereClause)
      .orderBy(desc(pengumuman.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items = data.map((row) => ({
      id: row.id,
      judul: row.judul,
      mode: row.mode,
      jumlah_penerima: row.jumlahPenerima,
      status: row.status,
      created_at: row.createdAt,
    }));

    return paginate(items, totalCount, page, pageSize);
  }

  /**
   * Get pengumuman detail for orang_tua.
   * Validates: pengumuman exists, user is recipient, tenant matches.
   *
   * Requirements: 6.6, 7.5, 7.6
   */
  async getDetail(pengumumanId: string, currentUser: RequestUser) {
    // Fetch the pengumuman
    const [record] = await this.db
      .select({
        id: pengumuman.id,
        judul: pengumuman.judul,
        deskripsi: pengumuman.deskripsi,
        tenantId: pengumuman.tenantId,
        createdAt: pengumuman.createdAt,
      })
      .from(pengumuman)
      .where(eq(pengumuman.id, pengumumanId));

    if (!record) {
      throw new NotFoundException('Pengumuman tidak ditemukan');
    }

    // Verify user is in pengumuman_penerima
    const [penerima] = await this.db
      .select({ id: pengumumanPenerima.id })
      .from(pengumumanPenerima)
      .where(
        and(
          eq(pengumumanPenerima.pengumumanId, pengumumanId),
          eq(pengumumanPenerima.userId, currentUser.id),
        ),
      );

    if (!penerima) {
      throw new ForbiddenException('Pengumuman tidak tersedia');
    }

    // Verify pengumuman tenant_id is in user's tenants list
    const userTenants = currentUser.tenants ?? [];
    if (!userTenants.includes(record.tenantId)) {
      throw new ForbiddenException('Pengumuman tidak tersedia');
    }

    // Get school name from tenant
    const [tenantRecord] = await this.db
      .select({ nama: tenant.nama })
      .from(tenant)
      .where(eq(tenant.id, record.tenantId));

    return {
      id: record.id,
      judul: record.judul,
      deskripsi: record.deskripsi,
      nama_sekolah: tenantRecord?.nama ?? '',
      created_at: record.createdAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────

  /**
   * Resolve broadcast recipients: all active orang_tua in the tenant.
   * A user is a valid broadcast recipient if they are an active orang_tua
   * with at least one active siswa in the tenant.
   *
   * Requirements: 2.1, 7.2
   */
  private async resolveBroadcastRecipients(tenantId: string): Promise<string[]> {
    // Find all distinct orang_tua IDs that have at least one active siswa in this tenant
    const results = await this.db
      .selectDistinct({ orangTuaId: siswa.orangTuaId })
      .from(siswa)
      .innerJoin(user, eq(user.id, siswa.orangTuaId))
      .where(
        and(
          eq(siswa.tenantId, tenantId),
          eq(siswa.status, 'aktif'),
          eq(user.role, 'orang_tua'),
          eq(user.isActive, true),
        ),
      );

    return results.filter((r) => r.orangTuaId !== null).map((r) => r.orangTuaId!);
  }

  /**
   * Resolve targeted recipients: orang_tua of selected siswa (deduplicated).
   * Skips invalid siswa (non-existent, inactive, no parent, wrong tenant).
   *
   * Requirements: 3.2, 3.3, 3.5, 3.6
   */
  private async resolveTargetedRecipients(tenantId: string, siswaIds: string[]): Promise<string[]> {
    if (siswaIds.length === 0) {
      throw new BadRequestException('Minimal satu siswa harus dipilih');
    }

    // Query siswa by IDs, filtering by tenant and active status
    const results = await this.db
      .selectDistinct({ orangTuaId: siswa.orangTuaId })
      .from(siswa)
      .innerJoin(user, eq(user.id, siswa.orangTuaId))
      .where(
        and(
          inArray(siswa.id, siswaIds),
          eq(siswa.tenantId, tenantId),
          eq(siswa.status, 'aktif'),
          eq(user.role, 'orang_tua'),
          eq(user.isActive, true),
        ),
      );

    const recipientIds = results.filter((r) => r.orangTuaId !== null).map((r) => r.orangTuaId!);

    // If all siswa are invalid → error
    if (recipientIds.length === 0) {
      throw new BadRequestException('Tidak ada penerima valid');
    }

    return recipientIds;
  }
}

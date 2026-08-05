import { Injectable } from '@nestjs/common';
import { eq, and, desc, lt } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { auditTrail } from '@/drizzle/schema/tagihan';
import { GetAuditTrailQueryDto } from './dto';

/**
 * Jenis aksi yang dicatat di audit trail.
 * Requirements: 29.1
 */
export type JenisAksi =
  | 'buat_tagihan'
  | 'edit_tagihan'
  | 'hapus_tagihan'
  | 'batalkan_tagihan'
  | 'catat_pembayaran_manual'
  | 'upload_bukti_transfer'
  | 'setujui_pembayaran'
  | 'tolak_pembayaran';

/**
 * Satu item perubahan field pada entri audit trail.
 * Digunakan untuk menampilkan riwayat perubahan dalam format human-readable.
 *
 * Requirements: 8.4
 */
export interface PerubahanItem {
  /** Nama teknis kolom, e.g. "nominal" */
  namaField: string;
  /** Label Bahasa Indonesia, e.g. "Nominal" */
  labelField: string;
  nilaiSebelum: unknown;
  nilaiSesudah: unknown;
}

export interface CreateAuditTrailEntry {
  tenantId: string;
  userId: string;
  jenisAksi: JenisAksi;
  entityType: string;
  entityId: string;
  nilaiSebelum?: Record<string, unknown> | null;
  nilaiSesudah?: Record<string, unknown> | null;
  alasan?: string | null;
  /** Label aksi dalam Bahasa Indonesia, maks 100 karakter. Requirements: 8.4 */
  aksiLabel?: string;
  /** Daftar perubahan field. Requirements: 8.4 */
  perubahan?: PerubahanItem[];
}

/**
 * AuditTrailService manages the append-only audit trail for billing operations.
 *
 * This service provides:
 * - `record()`: Inserts a new audit trail entry (write-only, never update/delete).
 * - `list()`: Cursor-paginated listing of audit trail entries, newest first.
 *
 * The audit_trail table is IMMUTABLE — no UPDATE or DELETE operations are exposed.
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5
 */
@Injectable()
export class AuditTrailService {
  constructor(private readonly drizzleService: DrizzleService) {}

  /**
   * Record a new audit trail entry.
   * Append-only — this is the only write operation available.
   *
   * Requirements: 29.1, 29.2, 29.5
   */
  async record(entry: CreateAuditTrailEntry): Promise<void> {
    const db = this.drizzleService.db;

    await db.insert(auditTrail).values({
      tenantId: entry.tenantId,
      userId: entry.userId,
      jenisAksi: entry.jenisAksi,
      entityType: entry.entityType,
      entityId: entry.entityId,
      nilaiSebelum: entry.nilaiSebelum ?? null,
      nilaiSesudah: entry.nilaiSesudah ?? null,
      alasan: entry.alasan ?? null,
      aksiLabel: entry.aksiLabel ?? null,
      perubahan: entry.perubahan ?? null,
    });
  }

  /**
   * List audit trail entries with cursor-based pagination, newest first.
   * Accessible by bendahara, admin (edit context), and kepala_sekolah (read-only).
   *
   * Cursor = audit trail entry ID. Fetches entries with created_at < cursor entry's created_at.
   *
   * Requirements: 29.3, 29.4
   */
  async list(tenantId: string, query: GetAuditTrailQueryDto) {
    const db = this.drizzleService.db;
    const limit = query.limit ?? 20;
    const conditions: ReturnType<typeof eq>[] = [eq(auditTrail.tenantId, tenantId)];

    // Filter by tagihan_id (entity_id)
    if (query.tagihan_id) {
      conditions.push(eq(auditTrail.entityId, query.tagihan_id));
    }

    // Cursor: fetch entries older than the cursor entry
    if (query.cursor) {
      const [cursorEntry] = await db
        .select({ createdAt: auditTrail.createdAt })
        .from(auditTrail)
        .where(and(eq(auditTrail.id, query.cursor), eq(auditTrail.tenantId, tenantId)));

      if (cursorEntry) {
        conditions.push(lt(auditTrail.createdAt, cursorEntry.createdAt));
      }
    }

    // Fetch limit + 1 to determine if there's a next page
    const rows = await db
      .select({
        id: auditTrail.id,
        userId: auditTrail.userId,
        jenisAksi: auditTrail.jenisAksi,
        entityType: auditTrail.entityType,
        entityId: auditTrail.entityId,
        nilaiSebelum: auditTrail.nilaiSebelum,
        nilaiSesudah: auditTrail.nilaiSesudah,
        alasan: auditTrail.alasan,
        aksiLabel: auditTrail.aksiLabel,
        perubahan: auditTrail.perubahan,
        createdAt: auditTrail.createdAt,
      })
      .from(auditTrail)
      .where(and(...conditions))
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit + 1);

    const hasNext = rows.length > limit;
    const data = rows.slice(0, limit);
    const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].id : null;

    return {
      data: data.map((row) => ({
        id: row.id,
        user_id: row.userId,
        jenis_aksi: row.jenisAksi,
        entity_type: row.entityType,
        entity_id: row.entityId,
        nilai_sebelum: row.nilaiSebelum,
        nilai_sesudah: row.nilaiSesudah,
        alasan: row.alasan,
        aksi_label: row.aksiLabel,
        perubahan: row.perubahan,
        created_at: row.createdAt,
      })),
      meta: {
        has_next: hasNext,
        cursor: nextCursor,
      },
    };
  }
}

import { Injectable, ForbiddenException } from '@nestjs/common';
import { eq, and, desc, lt } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { notifikasi, notifikasiPreferensi } from '@/drizzle/schema/notifikasi';
import { siswa } from '@/drizzle/schema/siswa';
import { UpdatePreferensiDto, GetRiwayatQueryDto } from './dto';

/**
 * Service handling notification preferences for orang_tua.
 *
 * Requirements: 25.1–25.4
 * - GET preferensi: returns per-child toggle states, defaults applied for children without records
 * - PATCH preferensi: upsert (INSERT ON CONFLICT UPDATE) preference per child
 */
@Injectable()
export class NotifikasiService {
  private readonly db;

  constructor(private readonly drizzleService: DrizzleService) {
    this.db = this.drizzleService.db;
  }

  /**
   * GET /notifikasi/preferensi
   * Returns notification preference toggle states for all children of the authenticated parent.
   * If no preference record exists for a child, returns defaults:
   *   kehadiran_enabled = false, ketidakhadiran_enabled = true
   *
   * Requirements: 25.1, 25.2, 25.4
   */
  async getPreferensi(userId: string) {
    // Get all active children of this parent
    const children = await this.db
      .select({ id: siswa.id, nama: siswa.nama })
      .from(siswa)
      .where(and(eq(siswa.orangTuaId, userId), eq(siswa.status, 'aktif')));

    if (children.length === 0) {
      return { preferensi: [] };
    }

    // Get existing preference records for this parent
    const existing = await this.db
      .select()
      .from(notifikasiPreferensi)
      .where(eq(notifikasiPreferensi.userId, userId));

    // Build a lookup map of existing preferences by siswa_id
    const prefMap = new Map(existing.map((p) => [p.siswaId, p]));

    // Build response with defaults for children without records
    const preferensi = children.map((child) => {
      const pref = prefMap.get(child.id);
      return {
        anak_id: child.id,
        anak_nama: child.nama,
        kehadiran_enabled: pref ? pref.kehadiranEnabled : false,
        ketidakhadiran_enabled: pref ? pref.ketidakhadiranEnabled : true,
      };
    });

    return { preferensi };
  }

  /**
   * PATCH /notifikasi/preferensi
   * Upsert notification preference for a specific child.
   * Validates that the child belongs to the authenticated parent.
   * Uses INSERT ON CONFLICT UPDATE for idempotent upsert.
   *
   * Requirements: 25.3, 25.4
   */
  async updatePreferensi(userId: string, dto: UpdatePreferensiDto) {
    // Validate that the child belongs to this parent
    const [child] = await this.db
      .select({ id: siswa.id, orangTuaId: siswa.orangTuaId })
      .from(siswa)
      .where(and(eq(siswa.id, dto.anak_id), eq(siswa.status, 'aktif')));

    if (!child) {
      throw new ForbiddenException('Siswa tidak ditemukan atau tidak aktif');
    }

    if (child.orangTuaId !== userId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke preferensi siswa ini');
    }

    // Upsert: INSERT ON CONFLICT UPDATE
    const [result] = await this.db
      .insert(notifikasiPreferensi)
      .values({
        userId,
        siswaId: dto.anak_id,
        kehadiranEnabled: dto.kehadiran_enabled,
        ketidakhadiranEnabled: dto.ketidakhadiran_enabled,
      })
      .onConflictDoUpdate({
        target: [notifikasiPreferensi.userId, notifikasiPreferensi.siswaId],
        set: {
          kehadiranEnabled: dto.kehadiran_enabled,
          ketidakhadiranEnabled: dto.ketidakhadiran_enabled,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      anak_id: result.siswaId,
      kehadiran_enabled: result.kehadiranEnabled,
      ketidakhadiran_enabled: result.ketidakhadiranEnabled,
      updated_at: result.updatedAt,
    };
  }

  /**
   * GET /notifikasi/riwayat
   * Returns cursor-paginated list of notification history for the authenticated parent,
   * sorted by created_at DESC (newest first).
   *
   * Cursor-based pagination uses the notification ID: fetches records with created_at
   * less than the cursor notification's created_at (i.e., older items).
   *
   * Requirements: 7.1, 7.2, 7.3
   */
  async getRiwayat(userId: string, query: GetRiwayatQueryDto) {
    const limit = query.limit ?? 20;
    const conditions = [eq(notifikasi.userId, userId)];

    // Cursor: fetch records older than the cursor notification
    if (query.cursor) {
      // Get the created_at of the cursor notification to determine the page boundary
      const [cursorNotif] = await this.db
        .select({ createdAt: notifikasi.createdAt })
        .from(notifikasi)
        .where(and(eq(notifikasi.id, query.cursor), eq(notifikasi.userId, userId)));

      if (cursorNotif) {
        conditions.push(lt(notifikasi.createdAt, cursorNotif.createdAt));
      }
    }

    // Fetch limit + 1 to determine if there's a next page
    const rows = await this.db
      .select({
        id: notifikasi.id,
        tipe: notifikasi.tipe,
        judul: notifikasi.judul,
        pesan: notifikasi.pesan,
        data: notifikasi.data,
        statusPengiriman: notifikasi.statusPengiriman,
        createdAt: notifikasi.createdAt,
      })
      .from(notifikasi)
      .where(and(...conditions))
      .orderBy(desc(notifikasi.createdAt))
      .limit(limit + 1);

    const hasNext = rows.length > limit;
    const data = rows.slice(0, limit);
    const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].id : null;

    return {
      data: data.map((row) => ({
        id: row.id,
        tipe: row.tipe,
        judul: row.judul,
        pesan: row.pesan,
        data: row.data,
        status_pengiriman: row.statusPengiriman,
        created_at: row.createdAt,
      })),
      meta: {
        has_next: hasNext,
        cursor: nextCursor,
      },
    };
  }
}

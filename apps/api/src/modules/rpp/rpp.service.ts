import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql, desc, lt, ilike } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { rpp, kategoriRpp, rppFavorit, mataPelajaran, user } from '@/drizzle/schema';
import { StorageService, BUCKET_PATHS } from '@/modules/storage/storage.service';
import { CreateRppDto } from './dto/create-rpp.dto';
import { UpdateRppDto } from './dto/update-rpp.dto';
import { GetRppQueryDto } from './dto/get-rpp-query.dto';

/** Allowed MIME types for RPP file upload (max 10 MB) */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * RPP Service — handles create, update, and delete of RPP/Modul Ajar.
 *
 * Requirements: 41.1–41.11, 42.1–42.6
 */
@Injectable()
export class RppService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Create a new RPP entry.
   * - For richtext: konten field contains HTML.
   * - For file: file is uploaded to R2 storage.
   * - Kategori: auto-creates kategori_rpp if name doesn't exist in tenant.
   * - On publish: sets tanggal_publish = now().
   *
   * Requirements: 41.1–41.10
   */
  async create(tenantId: string, guruId: string, dto: CreateRppDto, file?: Express.Multer.File) {
    // Validate content type logic
    if (dto.konten_type === 'file' && !file) {
      throw new BadRequestException('File wajib diupload untuk konten_type file');
    }
    if (dto.konten_type === 'richtext' && !dto.konten) {
      throw new BadRequestException('Konten wajib diisi untuk konten_type richtext');
    }

    // Validate file if provided
    if (file) {
      this.validateFile(file);
    }

    // Auto-create kategori if new (INSERT ON CONFLICT DO NOTHING)
    const kategoriId = await this.resolveKategori(tenantId, dto.kategori);

    // Upload file to R2 if applicable
    let fileUrl: string | null = null;
    let fileNama: string | null = null;
    let fileSize: number | null = null;

    if (dto.konten_type === 'file' && file) {
      const key = `${BUCKET_PATHS.RPP}/${tenantId}/${Date.now()}-${file.originalname}`;
      fileUrl = await this.storageService.upload(key, file.buffer, file.mimetype);
      fileNama = file.originalname;
      fileSize = file.size;
    }

    const now = new Date();
    const tanggalPublish = dto.status === 'published' ? now : null;

    const [created] = await this.db
      .insert(rpp)
      .values({
        tenantId,
        guruId,
        mataPelajaranId: dto.mata_pelajaran_id,
        kategoriId,
        judul: dto.judul,
        kontenType: dto.konten_type,
        konten: dto.konten_type === 'richtext' ? dto.konten : null,
        fileUrl,
        fileNama,
        fileSize,
        tahunTerbit: dto.tahun_terbit,
        status: dto.status,
        tanggalPublish: tanggalPublish,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  }

  /**
   * Update an existing RPP. Only the creator (guru_id) can edit.
   * - Can change status from published → draft (hides from others).
   * - On publish (draft → published): sets tanggal_publish = now().
   * - Can replace file if new file provided.
   *
   * Requirements: 42.1, 42.2, 42.3
   */
  async update(
    tenantId: string,
    guruId: string,
    rppId: string,
    dto: UpdateRppDto,
    file?: Express.Multer.File,
  ) {
    // Fetch existing RPP
    const [existing] = await this.db
      .select()
      .from(rpp)
      .where(and(eq(rpp.id, rppId), eq(rpp.tenantId, tenantId)));

    if (!existing) {
      throw new NotFoundException('RPP tidak ditemukan');
    }

    // Ownership check
    if (existing.guruId !== guruId) {
      throw new ForbiddenException('Hanya guru pembuat yang dapat mengedit RPP ini');
    }

    // Validate file if provided
    if (file) {
      this.validateFile(file);
    }

    // Build update payload
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (dto.judul !== undefined) updateData.judul = dto.judul;
    if (dto.mata_pelajaran_id !== undefined) updateData.mataPelajaranId = dto.mata_pelajaran_id;
    if (dto.tahun_terbit !== undefined) updateData.tahunTerbit = dto.tahun_terbit;
    if (dto.konten_type !== undefined) updateData.kontenType = dto.konten_type;

    // Handle kategori change
    if (dto.kategori !== undefined) {
      const kategoriId = await this.resolveKategori(tenantId, dto.kategori);
      updateData.kategoriId = kategoriId;
    }

    // Handle content change
    if (dto.konten_type === 'richtext' || (dto.konten !== undefined && !dto.konten_type)) {
      updateData.konten = dto.konten ?? null;
      // Clear file fields if switching to richtext
      if (dto.konten_type === 'richtext' && existing.kontenType === 'file') {
        // Delete old file from R2
        if (existing.fileUrl) {
          await this.storageService.delete(existing.fileUrl);
        }
        updateData.fileUrl = null;
        updateData.fileNama = null;
        updateData.fileSize = null;
      }
    }

    // Handle file replacement
    if (file) {
      // Delete old file from R2 if exists
      if (existing.fileUrl) {
        await this.storageService.delete(existing.fileUrl);
      }
      const key = `${BUCKET_PATHS.RPP}/${tenantId}/${Date.now()}-${file.originalname}`;
      updateData.fileUrl = await this.storageService.upload(key, file.buffer, file.mimetype);
      updateData.fileNama = file.originalname;
      updateData.fileSize = file.size;
      updateData.konten = null; // Clear richtext when switching to file
    }

    // Handle status change
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      // Set tanggal_publish when publishing
      if (dto.status === 'published' && existing.status !== 'published') {
        updateData.tanggalPublish = new Date();
      }
    }

    const [updated] = await this.db
      .update(rpp)
      .set(updateData)
      .where(and(eq(rpp.id, rppId), eq(rpp.tenantId, tenantId)))
      .returning();

    return updated;
  }

  /**
   * Delete an RPP. Only the creator (guru_id) can delete.
   * - Removes file from R2 storage (if any).
   * - Removes all rpp_favorit references.
   *
   * Requirements: 42.4, 42.5, 42.6
   */
  async delete(tenantId: string, guruId: string, rppId: string): Promise<void> {
    // Fetch existing RPP
    const [existing] = await this.db
      .select()
      .from(rpp)
      .where(and(eq(rpp.id, rppId), eq(rpp.tenantId, tenantId)));

    if (!existing) {
      throw new NotFoundException('RPP tidak ditemukan');
    }

    // Ownership check
    if (existing.guruId !== guruId) {
      throw new ForbiddenException('Hanya guru pembuat yang dapat menghapus RPP ini');
    }

    // Remove file from R2 if exists
    if (existing.fileUrl) {
      await this.storageService.delete(existing.fileUrl);
    }

    // Remove all favorit references
    await this.db.delete(rppFavorit).where(eq(rppFavorit.rppId, rppId));

    // Delete the RPP record
    await this.db.delete(rpp).where(and(eq(rpp.id, rppId), eq(rpp.tenantId, tenantId)));
  }

  /**
   * Toggle favorite on a published RPP for the logged-in guru.
   * If already favorited → remove. If not → add.
   * Only published RPP can be favorited.
   *
   * Requirements: 44.1, 44.2, 44.4
   */
  async toggleFavorite(
    tenantId: string,
    guruId: string,
    rppId: string,
  ): Promise<{ favorited: boolean }> {
    // Verify RPP exists and belongs to same tenant
    const [existing] = await this.db
      .select({ id: rpp.id, status: rpp.status })
      .from(rpp)
      .where(and(eq(rpp.id, rppId), eq(rpp.tenantId, tenantId)));

    if (!existing) {
      throw new NotFoundException('RPP tidak ditemukan');
    }

    if (existing.status !== 'published') {
      throw new BadRequestException('Hanya RPP yang berstatus published dapat difavoritkan');
    }

    // Check if already favorited
    const [existingFavorit] = await this.db
      .select({ id: rppFavorit.id })
      .from(rppFavorit)
      .where(and(eq(rppFavorit.guruId, guruId), eq(rppFavorit.rppId, rppId)));

    if (existingFavorit) {
      // Remove favorite (toggle off)
      await this.db
        .delete(rppFavorit)
        .where(and(eq(rppFavorit.guruId, guruId), eq(rppFavorit.rppId, rppId)));
      return { favorited: false };
    } else {
      // Add favorite (toggle on)
      await this.db.insert(rppFavorit).values({ guruId, rppId });
      return { favorited: true };
    }
  }

  /**
   * List all favorited RPP for the logged-in guru.
   * Only includes RPP where status='published' (hides draft/reverted ones).
   * Returns basic RPP info sorted by favorit creation date (newest first).
   *
   * Requirements: 44.3, 44.5
   */
  async listFavorites(tenantId: string, guruId: string) {
    const results = await this.db
      .select({
        favoritId: rppFavorit.id,
        favoritCreatedAt: rppFavorit.createdAt,
        rppId: rpp.id,
        judul: rpp.judul,
        kontenType: rpp.kontenType,
        tahunTerbit: rpp.tahunTerbit,
        status: rpp.status,
        tanggalPublish: rpp.tanggalPublish,
        guruId: rpp.guruId,
        mataPelajaranId: rpp.mataPelajaranId,
        kategoriId: rpp.kategoriId,
      })
      .from(rppFavorit)
      .innerJoin(rpp, eq(rppFavorit.rppId, rpp.id))
      .where(
        and(eq(rppFavorit.guruId, guruId), eq(rpp.tenantId, tenantId), eq(rpp.status, 'published')),
      )
      .orderBy(desc(rppFavorit.createdAt));

    return results;
  }

  // ─── Portal Methods (Requirements: 43.1–43.7) ─────────────────────────────

  /**
   * GET /rpp — List published RPP in the same tenant.
   * Cursor-based pagination sorted by tanggal_publish DESC.
   * Supports filters: kategori_id, mata_pelajaran_id, tahun_terbit, and text search by judul.
   *
   * Requirements: 43.1, 43.2, 43.3, 43.6, 43.7
   */
  async list(tenantId: string, query: GetRppQueryDto) {
    const limit = query.limit ?? 20;
    const conditions: any[] = [eq(rpp.tenantId, tenantId), eq(rpp.status, 'published')];

    // Filter by kategori
    if (query.kategori) {
      conditions.push(eq(rpp.kategoriId, query.kategori));
    }

    // Filter by mata pelajaran
    if (query.mapel) {
      conditions.push(eq(rpp.mataPelajaranId, query.mapel));
    }

    // Filter by tahun terbit
    if (query.tahun) {
      conditions.push(eq(rpp.tahunTerbit, query.tahun));
    }

    // Text search by judul
    if (query.search) {
      conditions.push(ilike(rpp.judul, `%${query.search}%`));
    }

    // Cursor-based pagination: fetch records older than cursor's tanggal_publish
    if (query.cursor) {
      const [cursorRpp] = await this.db
        .select({ tanggalPublish: rpp.tanggalPublish })
        .from(rpp)
        .where(and(eq(rpp.id, query.cursor), eq(rpp.tenantId, tenantId)));

      if (cursorRpp) {
        conditions.push(lt(rpp.tanggalPublish, cursorRpp.tanggalPublish));
      }
    }

    // Fetch limit + 1 to determine if there's a next page
    const rows = await this.db
      .select({
        id: rpp.id,
        judul: rpp.judul,
        kontenType: rpp.kontenType,
        tahunTerbit: rpp.tahunTerbit,
        tanggalPublish: rpp.tanggalPublish,
        updatedAt: rpp.updatedAt,
        guruNama: user.nama,
        mataPelajaranNama: mataPelajaran.nama,
        kategoriNama: kategoriRpp.nama,
      })
      .from(rpp)
      .innerJoin(user, eq(rpp.guruId, user.id))
      .innerJoin(mataPelajaran, eq(rpp.mataPelajaranId, mataPelajaran.id))
      .innerJoin(kategoriRpp, eq(rpp.kategoriId, kategoriRpp.id))
      .where(and(...conditions))
      .orderBy(desc(rpp.tanggalPublish))
      .limit(limit + 1);

    const hasNext = rows.length > limit;
    const data = rows.slice(0, limit);
    const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].id : null;

    return {
      data: data.map((row: any) => ({
        id: row.id,
        judul: row.judul,
        konten_type: row.kontenType,
        tahun_terbit: row.tahunTerbit,
        tanggal_publish: row.tanggalPublish,
        updated_at: row.updatedAt,
        guru_nama: row.guruNama,
        mata_pelajaran: row.mataPelajaranNama,
        kategori: row.kategoriNama,
      })),
      meta: {
        has_next: hasNext,
        cursor: nextCursor,
      },
    };
  }

  /**
   * GET /rpp/:id — Full detail view of a single RPP.
   * Accessible by any guru, kepala_sekolah, or admin in the same tenant.
   * Returns full konten for richtext, or file info for file type.
   *
   * Requirements: 43.4
   */
  async getDetail(tenantId: string, rppId: string) {
    const [row] = await this.db
      .select({
        id: rpp.id,
        judul: rpp.judul,
        kontenType: rpp.kontenType,
        konten: rpp.konten,
        fileUrl: rpp.fileUrl,
        fileNama: rpp.fileNama,
        fileSize: rpp.fileSize,
        tahunTerbit: rpp.tahunTerbit,
        status: rpp.status,
        tanggalPublish: rpp.tanggalPublish,
        createdAt: rpp.createdAt,
        updatedAt: rpp.updatedAt,
        guruId: rpp.guruId,
        guruNama: user.nama,
        mataPelajaranNama: mataPelajaran.nama,
        kategoriNama: kategoriRpp.nama,
      })
      .from(rpp)
      .innerJoin(user, eq(rpp.guruId, user.id))
      .innerJoin(mataPelajaran, eq(rpp.mataPelajaranId, mataPelajaran.id))
      .innerJoin(kategoriRpp, eq(rpp.kategoriId, kategoriRpp.id))
      .where(and(eq(rpp.id, rppId), eq(rpp.tenantId, tenantId)));

    if (!row) {
      throw new NotFoundException('RPP tidak ditemukan');
    }

    return {
      id: row.id,
      judul: row.judul,
      konten_type: row.kontenType,
      konten: row.kontenType === 'richtext' ? row.konten : null,
      file_nama: row.fileNama,
      file_size: row.fileSize,
      tahun_terbit: row.tahunTerbit,
      status: row.status,
      tanggal_publish: row.tanggalPublish,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      guru: {
        id: row.guruId,
        nama: row.guruNama,
      },
      mata_pelajaran: row.mataPelajaranNama,
      kategori: row.kategoriNama,
    };
  }

  /**
   * GET /rpp/:id/download — Presigned URL for file-type RPP (5-min expiry),
   * or throw appropriate error for richtext RPP (PDF generation placeholder).
   *
   * Requirements: 43.5
   */
  async getDownloadUrl(
    tenantId: string,
    rppId: string,
  ): Promise<{ url: string; file_nama: string }> {
    const [row] = await this.db
      .select({
        id: rpp.id,
        kontenType: rpp.kontenType,
        fileUrl: rpp.fileUrl,
        fileNama: rpp.fileNama,
        status: rpp.status,
      })
      .from(rpp)
      .where(and(eq(rpp.id, rppId), eq(rpp.tenantId, tenantId)));

    if (!row) {
      throw new NotFoundException('RPP tidak ditemukan');
    }

    if (row.status !== 'published') {
      throw new ForbiddenException('Hanya RPP yang berstatus published dapat didownload');
    }

    if (row.kontenType === 'file') {
      if (!row.fileUrl) {
        throw new NotFoundException('File RPP tidak ditemukan di storage');
      }
      const url = await this.storageService.getPresignedUrl(row.fileUrl, 300); // 5 minutes
      return { url, file_nama: row.fileNama ?? 'download' };
    }

    // For richtext: PDF generation
    // NOTE: Full PDF generation from HTML requires a library like Puppeteer or pdfmake.
    // For now, return an error indicating richtext download needs implementation via a job queue.
    throw new BadRequestException(
      'Download RPP richtext sebagai PDF belum tersedia. Silakan lihat konten langsung di halaman detail.',
    );
  }

  /**
   * Resolve kategori name to ID. If the kategori doesn't exist for the tenant,
   * auto-create it (INSERT ON CONFLICT DO NOTHING on tenant_id + nama).
   *
   * Requirements: 41.3, 41.4
   */
  private async resolveKategori(tenantId: string, kategoriNama: string): Promise<string> {
    // Try INSERT ON CONFLICT DO NOTHING, then SELECT
    await this.db
      .insert(kategoriRpp)
      .values({ tenantId, nama: kategoriNama })
      .onConflictDoNothing({ target: [kategoriRpp.tenantId, kategoriRpp.nama] });

    const [found] = await this.db
      .select()
      .from(kategoriRpp)
      .where(and(eq(kategoriRpp.tenantId, tenantId), eq(kategoriRpp.nama, kategoriNama)));

    return found.id;
  }

  /**
   * Validate uploaded file: MIME type and size.
   * Requirements: 41.1, 41.10
   */
  private validateFile(file: Express.Multer.File): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Format file tidak didukung. Gunakan PDF, DOC, DOCX, PPT, atau PPTX',
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Ukuran file maksimal 10MB');
    }
  }
}

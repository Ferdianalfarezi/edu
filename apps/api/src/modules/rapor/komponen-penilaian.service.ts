import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, asc, sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { komponenPenilaian } from '@/drizzle/schema/rapor';
import { CreateKomponenPenilaianDto, UpdateKomponenPenilaianDto } from './dto';

/**
 * Kurikulum Merdeka default assessment components.
 * Requirements: 36.1, 36.6
 */
export const KURIKULUM_MERDEKA_DEFAULTS: Omit<
  typeof komponenPenilaian.$inferInsert,
  'id' | 'tenantId' | 'createdAt'
>[] = [
  {
    nama: 'Pengetahuan',
    tipe: 'angka',
    skalaMin: 0,
    skalaMax: 100,
    isWajib: true,
    urutan: 1,
  },
  {
    nama: 'Keterampilan',
    tipe: 'angka',
    skalaMin: 0,
    skalaMax: 100,
    isWajib: true,
    urutan: 2,
  },
  {
    nama: 'Sikap',
    tipe: 'huruf',
    skalaMin: null,
    skalaMax: null,
    isWajib: true,
    urutan: 3,
  },
  {
    nama: 'P5',
    tipe: 'deskripsi',
    skalaMin: null,
    skalaMax: null,
    isWajib: false,
    urutan: 4,
  },
];

export interface KomponenPenilaianResult {
  id: string;
  nama: string;
  tipe: 'angka' | 'huruf' | 'deskripsi';
  skala_min: number | null;
  skala_max: number | null;
  is_wajib: boolean | null;
  urutan: number | null;
  created_at: Date | null;
}

@Injectable()
export class KomponenPenilaianService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Create a new assessment component for a tenant.
   * Requirements: 36.2, 36.3
   */
  async create(
    tenantId: string,
    dto: CreateKomponenPenilaianDto,
  ): Promise<KomponenPenilaianResult> {
    const result = await this.db
      .insert(komponenPenilaian)
      .values({
        tenantId,
        nama: dto.nama,
        tipe: dto.tipe,
        skalaMin: dto.tipe === 'angka' ? (dto.skala_min ?? 0) : null,
        skalaMax: dto.tipe === 'angka' ? (dto.skala_max ?? 100) : null,
        isWajib: dto.is_wajib ?? true,
        urutan: dto.urutan ?? 0,
      })
      .returning({
        id: komponenPenilaian.id,
        nama: komponenPenilaian.nama,
        tipe: komponenPenilaian.tipe,
        skala_min: komponenPenilaian.skalaMin,
        skala_max: komponenPenilaian.skalaMax,
        is_wajib: komponenPenilaian.isWajib,
        urutan: komponenPenilaian.urutan,
        created_at: komponenPenilaian.createdAt,
      });

    return result[0];
  }

  /**
   * List all assessment components for a tenant, ordered by `urutan`.
   * Requirements: 36.3
   */
  async findAll(tenantId: string): Promise<KomponenPenilaianResult[]> {
    return this.db
      .select({
        id: komponenPenilaian.id,
        nama: komponenPenilaian.nama,
        tipe: komponenPenilaian.tipe,
        skala_min: komponenPenilaian.skalaMin,
        skala_max: komponenPenilaian.skalaMax,
        is_wajib: komponenPenilaian.isWajib,
        urutan: komponenPenilaian.urutan,
        created_at: komponenPenilaian.createdAt,
      })
      .from(komponenPenilaian)
      .where(eq(komponenPenilaian.tenantId, tenantId))
      .orderBy(asc(komponenPenilaian.urutan));
  }

  /**
   * Update an existing assessment component.
   * Requirements: 36.2
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateKomponenPenilaianDto,
  ): Promise<KomponenPenilaianResult> {
    // Build update set dynamically from provided fields
    const updateSet: Record<string, any> = {};

    if (dto.nama !== undefined) updateSet.nama = dto.nama;
    if (dto.tipe !== undefined) {
      updateSet.tipe = dto.tipe;
      // Clear skala fields for non-angka types
      if (dto.tipe !== 'angka') {
        updateSet.skalaMin = null;
        updateSet.skalaMax = null;
      }
    }
    if (dto.skala_min !== undefined) updateSet.skalaMin = dto.skala_min;
    if (dto.skala_max !== undefined) updateSet.skalaMax = dto.skala_max;
    if (dto.is_wajib !== undefined) updateSet.isWajib = dto.is_wajib;
    if (dto.urutan !== undefined) updateSet.urutan = dto.urutan;

    if (Object.keys(updateSet).length === 0) {
      // Nothing to update, just return existing
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundException('Komponen penilaian tidak ditemukan');
      }
      return existing;
    }

    const result = await this.db
      .update(komponenPenilaian)
      .set(updateSet)
      .where(and(eq(komponenPenilaian.id, id), eq(komponenPenilaian.tenantId, tenantId)))
      .returning({
        id: komponenPenilaian.id,
        nama: komponenPenilaian.nama,
        tipe: komponenPenilaian.tipe,
        skala_min: komponenPenilaian.skalaMin,
        skala_max: komponenPenilaian.skalaMax,
        is_wajib: komponenPenilaian.isWajib,
        urutan: komponenPenilaian.urutan,
        created_at: komponenPenilaian.createdAt,
      });

    if (result.length === 0) {
      throw new NotFoundException('Komponen penilaian tidak ditemukan');
    }

    return result[0];
  }

  /**
   * Delete an assessment component if it's not referenced in rapor_nilai.
   * Requirements: 36.2
   */
  async delete(tenantId: string, id: string): Promise<void> {
    // Check if the komponen_id appears in any komponen_nilai JSONB
    // komponen_nilai is JSONB [{komponen_id, nilai}], we use a raw SQL check
    const referencedRows = await this.db.execute(
      sql`SELECT 1 FROM rapor_nilai WHERE tenant_id = ${tenantId} AND komponen_nilai::jsonb @> ${`[{"komponen_id": "${id}"}]`}::jsonb LIMIT 1`,
    );

    if ((referencedRows as any).rows?.length > 0 || (referencedRows as any).length > 0) {
      throw new ConflictException(
        'Komponen penilaian tidak dapat dihapus karena sudah digunakan dalam rapor nilai',
      );
    }

    const result = await this.db
      .delete(komponenPenilaian)
      .where(and(eq(komponenPenilaian.id, id), eq(komponenPenilaian.tenantId, tenantId)))
      .returning({ id: komponenPenilaian.id });

    if (result.length === 0) {
      throw new NotFoundException('Komponen penilaian tidak ditemukan');
    }
  }

  /**
   * Initialize Kurikulum Merdeka default assessment components for a tenant.
   * Creates: Pengetahuan (angka 0-100), Keterampilan (angka 0-100), Sikap (huruf), P5 (deskripsi, opsional).
   * Requirements: 36.1, 36.6
   */
  async initDefaults(tenantId: string): Promise<KomponenPenilaianResult[]> {
    // Check if tenant already has components
    const existing = await this.db
      .select({ id: komponenPenilaian.id })
      .from(komponenPenilaian)
      .where(eq(komponenPenilaian.tenantId, tenantId))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(
        'Komponen penilaian sudah dikonfigurasi. Hapus komponen existing terlebih dahulu untuk re-init.',
      );
    }

    const values = KURIKULUM_MERDEKA_DEFAULTS.map((d) => ({
      ...d,
      tenantId,
    }));

    const result = await this.db.insert(komponenPenilaian).values(values).returning({
      id: komponenPenilaian.id,
      nama: komponenPenilaian.nama,
      tipe: komponenPenilaian.tipe,
      skala_min: komponenPenilaian.skalaMin,
      skala_max: komponenPenilaian.skalaMax,
      is_wajib: komponenPenilaian.isWajib,
      urutan: komponenPenilaian.urutan,
      created_at: komponenPenilaian.createdAt,
    });

    return result;
  }

  /**
   * Find a single component by ID and tenant.
   */
  private async findById(tenantId: string, id: string): Promise<KomponenPenilaianResult | null> {
    const result = await this.db
      .select({
        id: komponenPenilaian.id,
        nama: komponenPenilaian.nama,
        tipe: komponenPenilaian.tipe,
        skala_min: komponenPenilaian.skalaMin,
        skala_max: komponenPenilaian.skalaMax,
        is_wajib: komponenPenilaian.isWajib,
        urutan: komponenPenilaian.urutan,
        created_at: komponenPenilaian.createdAt,
      })
      .from(komponenPenilaian)
      .where(and(eq(komponenPenilaian.id, id), eq(komponenPenilaian.tenantId, tenantId)));

    return result.length > 0 ? result[0] : null;
  }
}

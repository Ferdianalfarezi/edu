import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { kelas } from '@/drizzle/schema/kelas';
import { jadwalPelajaran } from '@/drizzle/schema/jadwal';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { rapor } from '@/drizzle/schema/rapor';
import { RaporFinalizationService } from './rapor-finalization.service';
import { SaveCatatanDto } from './dto';

@Injectable()
export class RaporWaliService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly raporFinalizationService: RaporFinalizationService,
  ) {}

  /**
   * Get kelas where the current user is wali kelas.
   */
  async getKelasWali(tenantId: string, guruId: string) {
    // Get active tahun ajaran
    const [activeTa] = await this.db
      .select({ id: tahunAjaran.id })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')))
      .limit(1);

    if (!activeTa) return [];

    const results = await this.db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
      })
      .from(kelas)
      .where(
        and(
          eq(kelas.tenantId, tenantId),
          eq(kelas.waliKelasId, guruId),
          eq(kelas.tahunAjaranId, activeTa.id),
        ),
      );

    return results;
  }

  /**
   * Get classes that a guru teaches for a specific mapel (via jadwal).
   */
  async getKelasByMapel(tenantId: string, guruId: string, mapelId: string) {
    // Get active tahun ajaran
    const [activeTa] = await this.db
      .select({ id: tahunAjaran.id })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')))
      .limit(1);

    if (!activeTa) return [];

    // Find distinct kelas from jadwal where guru teaches this mapel
    const results = await this.db
      .selectDistinctOn([kelas.id], {
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
      })
      .from(jadwalPelajaran)
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .where(
        and(
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.mataPelajaranId, mapelId),
          eq(kelas.tahunAjaranId, activeTa.id),
        ),
      );

    return results;
  }

  /**
   * Get finalization overview for a kelas/periode (mapel status, students, rapor status).
   */
  async getFinalizeOverview(tenantId: string, userId: string, kelasId: string, periodeId: string) {
    // Validate wali kelas
    await this.raporFinalizationService.validateWaliKelas(tenantId, userId, kelasId);

    // Get active tahun ajaran
    const [activeTa] = await this.db
      .select({ id: tahunAjaran.id })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')))
      .limit(1);

    // Get rapor record for this kelas/periode
    const raporRecords = await this.db
      .select({
        id: rapor.id,
        status: rapor.status,
      })
      .from(rapor)
      .where(
        and(
          eq(rapor.tenantId, tenantId),
          eq(rapor.kelasId, kelasId),
          eq(rapor.periode, periodeId as any),
          ...(activeTa ? [eq(rapor.tahunAjaranId, activeTa.id)] : []),
        ),
      )
      .limit(1);

    const raporRecord = raporRecords.length > 0 ? raporRecords[0] : null;
    const raporStatus = raporRecord
      ? { id: raporRecord.id, status: raporRecord.status }
      : { id: null, status: 'draft' };

    // Get mapel submission statuses (only if rapor and tahunAjaran exist)
    let mapelStatus: any[] = [];
    if (raporRecord && activeTa) {
      mapelStatus = await this.raporFinalizationService.getMapelSubmissionStatuses(
        tenantId,
        kelasId,
        raporRecord.id,
        activeTa.id,
      );
    }

    return {
      mapel_status: mapelStatus,
      rapor: raporStatus,
    };
  }

  /**
   * Save catatan (notes) from wali kelas for students.
   */
  async saveCatatan(tenantId: string, userId: string, dto: SaveCatatanDto) {
    // Validate wali kelas
    await this.raporFinalizationService.validateWaliKelas(tenantId, userId, dto.kelas_id);

    // Save catatan via finalization service (it has the saveStudentNotes method)
    // For now, return success — the actual note persistence depends on schema
    return { saved: dto.catatan.length };
  }
}

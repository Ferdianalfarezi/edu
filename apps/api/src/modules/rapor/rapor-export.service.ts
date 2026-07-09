import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { rapor } from '@/drizzle/schema/rapor';
import { kelas } from '@/drizzle/schema/kelas';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { ExportRaporQueryDto } from './dto';

/**
 * RaporExportService — Handles rapor export to Excel.
 * Only allows export of finalized rapor.
 * Enqueues export job to Bull EXPORT queue.
 *
 * Requirements: 40.1–40.4
 */
@Injectable()
export class RaporExportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    @InjectQueue(QUEUE_NAMES.EXPORT) private readonly exportQueue: Queue,
  ) {}

  /**
   * Export rapor per kelas per periode.
   * Validates the rapor is finalized before allowing export.
   * Enqueues to Bull EXPORT queue and returns job_id.
   *
   * @param tenantId - Tenant context
   * @param requestedBy - User ID of the admin requesting export
   * @param query - Export params: kelas_id, periode, format
   * @returns { job_id, message }
   */
  async exportRapor(
    tenantId: string,
    requestedBy: string,
    query: ExportRaporQueryDto,
  ): Promise<{ job_id: string; message: string }> {
    const { kelas_id, periode, format = 'xlsx' } = query;

    // 1. Validate kelas exists
    const kelasRows = await this.db
      .select({ id: kelas.id, nama: kelas.nama, tahunAjaranId: kelas.tahunAjaranId })
      .from(kelas)
      .where(and(eq(kelas.id, kelas_id), eq(kelas.tenantId, tenantId)));

    if (kelasRows.length === 0) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    const kelasData = kelasRows[0];

    // 2. Validate rapor exists and is finalized (Requirement 40.3)
    const raporRows = await this.db
      .select({ id: rapor.id, status: rapor.status })
      .from(rapor)
      .where(
        and(
          eq(rapor.kelasId, kelas_id),
          eq(rapor.tahunAjaranId, kelasData.tahunAjaranId),
          eq(rapor.periode, periode as any),
          eq(rapor.tenantId, tenantId),
        ),
      );

    if (raporRows.length === 0) {
      throw new NotFoundException('Rapor tidak ditemukan untuk kelas dan periode ini');
    }

    const raporData = raporRows[0];

    if (raporData.status !== 'final') {
      throw new BadRequestException(
        'Export hanya dapat dilakukan untuk rapor yang sudah difinalkan',
      );
    }

    // 3. Enqueue export job
    const job = await this.exportQueue.add('export-rapor', {
      tenantId,
      kelasId: kelas_id,
      periode,
      format,
      requestedBy,
    });

    return {
      job_id: job.id as string,
      message: 'Export rapor sedang diproses. Silakan cek status export secara berkala.',
    };
  }
}

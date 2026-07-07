import { Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { StorageService, BUCKET_PATHS } from '@/modules/storage/storage.service';
import { BaseProcessor } from './base.processor';

// ─── Job Payload Interfaces ─────────────────────────────────────────────────

export interface ExportRekapAbsensiJobData {
  tenantId: string;
  kelasId: string;
  bulan?: number;
  tahun?: number;
  periode: 'bulanan' | 'semester';
  format: 'xlsx' | 'csv';
  requestedBy: string;
}

export interface ExportRaporJobData {
  tenantId: string;
  kelasId: string;
  periode: string;
  format: 'xlsx' | 'csv';
  requestedBy: string;
}

export interface ExportTagihanJobData {
  tenantId: string;
  format: 'xlsx' | 'csv';
  periode_bulan?: number;
  periode_tahun?: number;
  requestedBy: string;
}

export type ExportJobData = ExportRekapAbsensiJobData | ExportRaporJobData | ExportTagihanJobData;

// ─── Export Result ──────────────────────────────────────────────────────────

export interface ExportResult {
  filePath: string;
  filename: string;
  format: string;
  size: number;
}

// ─── Export Processor ───────────────────────────────────────────────────────

/**
 * ExportProcessor handles background export jobs for:
 * 1. export-rekap-absensi — attendance recap reports
 * 2. export-rapor — grade reports
 * 3. export-tagihan — billing/tunggakan reports
 *
 * Processing steps per job:
 * 1. Log the export request with metadata
 * 2. Generate a placeholder file (JSON with job data; actual XLSX via exceljs in production)
 * 3. Upload to R2 at `exports/{tenantId}/{jobId}/{filename}`
 * 4. Return the file path for consumers to generate download URLs
 *
 * Requirements: 4.4, 15.6, 15.7, 40.1
 */
@Processor(QUEUE_NAMES.EXPORT)
export class ExportProcessor extends BaseProcessor {
  private readonly processorLogger = new Logger(ExportProcessor.name);

  constructor(private readonly storageService: StorageService) {
    super('ExportProcessor', { concurrency: 5, maxAttempts: 3 });
  }

  // ─── export-rekap-absensi ─────────────────────────────────────────────────

  @Process('export-rekap-absensi')
  async handleExportRekapAbsensi(job: Job<ExportRekapAbsensiJobData>): Promise<ExportResult> {
    const { tenantId, kelasId, bulan, tahun, periode, format, requestedBy } = job.data;

    this.processorLogger.log(
      `Processing export-rekap-absensi: tenant=${tenantId}, kelas=${kelasId}, ` +
        `periode=${periode}, bulan=${bulan}, tahun=${tahun}, format=${format}, requestedBy=${requestedBy}`,
    );

    // Generate placeholder file content
    // In production, this will query the DB and generate actual XLSX via exceljs
    const exportData = {
      type: 'rekap-absensi',
      generatedAt: new Date().toISOString(),
      parameters: { tenantId, kelasId, bulan, tahun, periode, format },
      requestedBy,
      // Placeholder data structure that would be populated from DB
      data: [],
    };

    const { buffer, contentType, filename } = this.buildFileOutput(
      exportData,
      format,
      'rekap-absensi',
    );

    // Upload to R2
    const filePath = `${BUCKET_PATHS.EXPORTS}/${tenantId}/${job.id}/${filename}`;
    await this.storageService.upload(filePath, buffer, contentType);

    this.processorLogger.log(
      `export-rekap-absensi completed: uploaded to ${filePath} (${buffer.length} bytes)`,
    );

    return {
      filePath,
      filename,
      format,
      size: buffer.length,
    };
  }

  // ─── export-rapor ─────────────────────────────────────────────────────────

  @Process('export-rapor')
  async handleExportRapor(job: Job<ExportRaporJobData>): Promise<ExportResult> {
    const { tenantId, kelasId, periode, format, requestedBy } = job.data;

    this.processorLogger.log(
      `Processing export-rapor: tenant=${tenantId}, kelas=${kelasId}, ` +
        `periode=${periode}, format=${format}, requestedBy=${requestedBy}`,
    );

    // Generate placeholder file content
    const exportData = {
      type: 'rapor',
      generatedAt: new Date().toISOString(),
      parameters: { tenantId, kelasId, periode, format },
      requestedBy,
      data: [],
    };

    const { buffer, contentType, filename } = this.buildFileOutput(exportData, format, 'rapor');

    // Upload to R2
    const filePath = `${BUCKET_PATHS.EXPORTS}/${tenantId}/${job.id}/${filename}`;
    await this.storageService.upload(filePath, buffer, contentType);

    this.processorLogger.log(
      `export-rapor completed: uploaded to ${filePath} (${buffer.length} bytes)`,
    );

    return {
      filePath,
      filename,
      format,
      size: buffer.length,
    };
  }

  // ─── export-tagihan ───────────────────────────────────────────────────────

  @Process('export-tagihan')
  async handleExportTagihan(job: Job<ExportTagihanJobData>): Promise<ExportResult> {
    const { tenantId, format, periode_bulan, periode_tahun, requestedBy } = job.data;

    this.processorLogger.log(
      `Processing export-tagihan: tenant=${tenantId}, ` +
        `periode_bulan=${periode_bulan}, periode_tahun=${periode_tahun}, ` +
        `format=${format}, requestedBy=${requestedBy}`,
    );

    // Generate placeholder file content
    const exportData = {
      type: 'tagihan',
      generatedAt: new Date().toISOString(),
      parameters: { tenantId, format, periode_bulan, periode_tahun },
      requestedBy,
      data: [],
    };

    const { buffer, contentType, filename } = this.buildFileOutput(exportData, format, 'tagihan');

    // Upload to R2
    const filePath = `${BUCKET_PATHS.EXPORTS}/${tenantId}/${job.id}/${filename}`;
    await this.storageService.upload(filePath, buffer, contentType);

    this.processorLogger.log(
      `export-tagihan completed: uploaded to ${filePath} (${buffer.length} bytes)`,
    );

    return {
      filePath,
      filename,
      format,
      size: buffer.length,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Build file output based on format.
   * For now creates JSON placeholder. In production, xlsx format will use exceljs
   * to create real spreadsheets with proper headers and data rows.
   */
  private buildFileOutput(
    data: Record<string, unknown>,
    format: 'xlsx' | 'csv',
    prefix: string,
  ): { buffer: Buffer; contentType: string; filename: string } {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'csv') {
      // CSV placeholder: serialize data as JSON-in-CSV for now
      const csvContent = this.buildCsvPlaceholder(data);
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv',
        filename: `${prefix}_${timestamp}.csv`,
      };
    }

    // XLSX placeholder: store as JSON buffer (will be replaced by exceljs in production)
    const jsonContent = JSON.stringify(data, null, 2);
    return {
      buffer: Buffer.from(jsonContent, 'utf-8'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${prefix}_${timestamp}.xlsx`,
    };
  }

  /**
   * Build a CSV placeholder string.
   * In production this will format actual row data with proper column headers.
   */
  private buildCsvPlaceholder(data: Record<string, unknown>): string {
    const lines: string[] = [];
    lines.push('type,generatedAt,requestedBy');
    lines.push(`${data.type},${data.generatedAt},${data.requestedBy}`);
    lines.push('');
    lines.push('# Parameters');
    const params = data.parameters as Record<string, unknown>;
    if (params) {
      lines.push(Object.keys(params).join(','));
      lines.push(
        Object.values(params)
          .map((v) => v ?? '')
          .join(','),
      );
    }
    return lines.join('\n');
  }
}

import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { eq, and, or, asc, gt, sql } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { StorageService, BUCKET_PATHS } from '@/modules/storage/storage.service';
import { KonfigurasiService, DEFAULT_CONFIG } from '@/modules/konfigurasi/konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { tagihan, tagihanTransaksi } from '@/drizzle/schema/tagihan';
import { siswa } from '@/drizzle/schema/siswa';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { AuditTrailService } from './audit-trail.service';
import {
  GenerateTagihanDto,
  ManualPaymentDto,
  UploadBuktiDto,
  VerifyPaymentDto,
  EditTagihanDto,
  CancelTagihanDto,
  GetTunggakanQueryDto,
  ExportTagihanQueryDto,
  ListTagihanQueryDto,
} from './dto';
import { randomUUID } from 'crypto';

/**
 * Allowed MIME types for bukti transfer upload.
 * Requirements: 11.5
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

/**
 * Maximum file size in bytes (5MB).
 * Requirements: 11.5
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Minimum payment amount (Rp 10.000).
 * Requirements: 11.9
 */
const MIN_NOMINAL = 10000;

/** Lock TTL in seconds for billing generation (5 minutes). */
const BILLING_LOCK_TTL = 300;

/** Chunk size for processing students per transaction. */
const CHUNK_SIZE = 100;

export interface GenerateTagihanResult {
  created: number;
  skipped: number;
  total_nominal: number;
  months_processed: number;
}

@Injectable()
export class TagihanService {
  private readonly logger = new Logger(TagihanService.name);

  constructor(
    private readonly drizzleService: DrizzleService,
    private readonly storageService: StorageService,
    private readonly konfigurasiService: KonfigurasiService,
    private readonly redisService: RedisService,
    private readonly auditTrailService: AuditTrailService,
    @InjectQueue(QUEUE_NAMES.IMAGE) private readonly imageQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EXPORT) private readonly exportQueue: Queue,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // TAGIHAN GENERATION (Requirements: 9.1–9.7, 10.1–10.5)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Generate tagihan SPP for active students.
   *
   * Two modes:
   * 1. Per-month: bulan + tahun → generate for that specific month
   * 2. Per-tahun_ajaran: tahun_ajaran_id → generate for ALL months in that academic year
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency (ADR-007).
   * Uses Redis distributed lock to prevent concurrent generation.
   * Processes students in chunks of 100.
   *
   * Requirements: 9.1–9.7, 10.1–10.5
   */
  async generateTagihan(tenantId: string, dto: GenerateTagihanDto): Promise<GenerateTagihanResult> {
    // Validate request: must provide either (bulan + tahun) or tahun_ajaran_id
    if (!dto.tahun_ajaran_id && (!dto.bulan || !dto.tahun)) {
      throw new BadRequestException('Harus menyediakan tahun_ajaran_id atau bulan + tahun');
    }

    // Determine tahun_ajaran context
    let tahunAjaranId: string;
    let months: { bulan: number; tahun: number }[];

    if (dto.tahun_ajaran_id) {
      // Mode: per-tahun_ajaran — generate for all months
      const ta = await this.getTahunAjaran(tenantId, dto.tahun_ajaran_id);
      tahunAjaranId = ta.id;
      months = this.getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
    } else {
      // Mode: per-month — get the active tahun ajaran
      const ta = await this.getActiveTahunAjaran(tenantId);
      tahunAjaranId = ta.id;
      months = [{ bulan: dto.bulan!, tahun: dto.tahun! }];
    }

    if (months.length === 0) {
      throw new BadRequestException('Tidak ada bulan yang valid dalam rentang tahun ajaran');
    }

    // Acquire distributed lock (ADR-007)
    const lockKey = `billing-gen:${tenantId}:${tahunAjaranId}`;
    const acquired = await this.redisService.acquireLock(lockKey, BILLING_LOCK_TTL);
    if (!acquired) {
      throw new ConflictException(
        'Proses generate tagihan sedang berjalan. Silakan coba lagi nanti.',
      );
    }

    try {
      return await this.processGeneration(tenantId, tahunAjaranId, months);
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  /**
   * Auto-generate tagihan for a new student.
   * Creates tagihan from bulan berjalan to end of tahun_ajaran.
   * Called when a student is added to a class that already has tagihan.
   *
   * Requirements: 9.5, 9.6, 9.7
   */
  async generateTagihanForNewStudent(
    tenantId: string,
    siswaId: string,
    kelasId: string,
    tahunAjaranId: string,
  ): Promise<{ created: number; total_nominal: number }> {
    const db = this.drizzleService.db;

    // Get tahun ajaran dates
    const ta = await this.getTahunAjaran(tenantId, tahunAjaranId);

    // Calculate months from current month to end of tahun ajaran
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-based
    const currentYear = now.getFullYear();

    const allMonths = this.getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
    const futureMonths = allMonths.filter((m) => {
      if (m.tahun > currentYear) return true;
      if (m.tahun === currentYear && m.bulan >= currentMonth) return true;
      return false;
    });

    if (futureMonths.length === 0) {
      return { created: 0, total_nominal: 0 };
    }

    // Get kelas → tingkat → nominal
    const kelasData = await this.getKelasWithTingkat(tenantId, kelasId);
    const nominal = await this.getNominalForTingkat(tenantId, kelasData.tingkat);
    const tanggalJatuhTempo = await this.getTanggalJatuhTempo(tenantId);

    // Get student parent info for notification
    const studentInfo = await this.getStudentInfo(siswaId);

    // Insert tagihan for each month (ON CONFLICT DO NOTHING)
    const values = futureMonths.map((m) => ({
      tenantId,
      siswaId,
      bulan: m.bulan,
      tahun: m.tahun,
      tahunAjaranId,
      nominal,
      tanggalJatuhTempo: this.buildJatuhTempoDate(m.bulan, m.tahun, tanggalJatuhTempo),
    }));

    const inserted = await db
      .insert(tagihan)
      .values(values)
      .onConflictDoNothing({
        target: [tagihan.siswaId, tagihan.bulan, tagihan.tahun],
      })
      .returning({ id: tagihan.id, bulan: tagihan.bulan, tahun: tagihan.tahun });

    const created = inserted.length;
    const totalNominal = created * nominal;

    // Send notification to parent for new tagihan
    if (created > 0 && studentInfo?.orangTuaId) {
      await this.enqueueNewTagihanNotification(
        tenantId,
        studentInfo.orangTuaId,
        siswaId,
        studentInfo.nama,
        inserted,
        nominal,
        tanggalJatuhTempo,
      );
    }

    return { created, total_nominal: totalNominal };
  }

  // ═══════════════════════════════════════════════════════════════════
  // BUKTI TRANSFER UPLOAD (Requirements: 11.1–11.17)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Upload bukti transfer for a tagihan.
   *
   * Validations:
   * 1. Tagihan exists and belongs to the parent's child (Req 11.1)
   * 2. Status allows upload: belum_bayar, ditolak, cicilan (Req 11.1, 11.8)
   * 3. File format: JPG/JPEG/PNG only (Req 11.5)
   * 4. File size: max 5MB (Req 11.5)
   * 5. nominal_bayar >= 10000 (Req 11.9)
   * 6. nominal_bayar <= sisa tagihan (Req 11.10)
   * 7. Max 2 cicilan via upload (Req 11.13)
   * 8. Second cicilan must equal remaining balance exactly (Req 11.14)
   *
   * On success:
   * - Create tagihan_transaksi record (status: pending, metode: upload_bukti)
   * - Set tagihan status to menunggu_verifikasi (Req 11.4)
   * - Enqueue WebP compression job (Req 11.15)
   *
   * Requirements: 11.1–11.17
   */
  async uploadBuktiTransfer(
    userId: string,
    tagihanId: string,
    dto: UploadBuktiDto,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const db = this.drizzleService.db;

    // 1. Find the tagihan
    const [tagihanRecord] = await db
      .select()
      .from(tagihan)
      .where(eq(tagihan.id, tagihanId))
      .limit(1);

    if (!tagihanRecord) {
      throw new NotFoundException('Tagihan tidak ditemukan');
    }

    // 2. Validate that the tagihan belongs to the parent's child
    const [siswaRecord] = await db
      .select()
      .from(siswa)
      .where(and(eq(siswa.id, tagihanRecord.siswaId), eq(siswa.orangTuaId, userId)))
      .limit(1);

    if (!siswaRecord) {
      throw new ForbiddenException('Tagihan ini bukan milik anak Anda');
    }

    // 3. Validate status allows upload (Req 11.1, 11.8)
    const allowedStatuses = ['belum_bayar', 'ditolak', 'cicilan'];
    if (!allowedStatuses.includes(tagihanRecord.status)) {
      if (tagihanRecord.status === 'menunggu_verifikasi') {
        throw new BadRequestException(
          'Tagihan sedang menunggu verifikasi. Silakan tunggu keputusan bendahara.',
        );
      }
      throw new BadRequestException(
        `Tidak dapat mengupload bukti transfer untuk tagihan dengan status "${tagihanRecord.status}"`,
      );
    }

    // 4. Validate file format (Req 11.5)
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      throw new BadRequestException('Format file tidak didukung. Gunakan JPG, JPEG, atau PNG.');
    }

    // 5. Validate file size (Req 11.5)
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Ukuran file maksimal 5MB');
    }

    // 6. Validate nominal_bayar (Req 11.9)
    const nominalBayar = dto.nominal_bayar;
    if (nominalBayar < MIN_NOMINAL) {
      throw new BadRequestException('Nominal pembayaran minimal Rp 10.000');
    }

    // 7. Calculate sisa tagihan (Req 11.10)
    const sisaTagihan = tagihanRecord.nominal - tagihanRecord.totalDibayar;
    if (nominalBayar > sisaTagihan) {
      throw new BadRequestException('Nominal melebihi sisa tagihan');
    }

    // 8. Enforce max 2 cicilan via upload (Req 11.13, 11.14)
    const existingApprovedTransactions = await db
      .select()
      .from(tagihanTransaksi)
      .where(
        and(
          eq(tagihanTransaksi.tagihanId, tagihanId),
          eq(tagihanTransaksi.metode, 'upload_bukti'),
          eq(tagihanTransaksi.status, 'approved'),
        ),
      );

    const approvedCount = existingApprovedTransactions.length;

    if (approvedCount >= 2) {
      throw new BadRequestException('Maksimal 2 kali pembayaran cicilan via upload bukti transfer');
    }

    // If already 1 approved transaction, second must equal remaining balance exactly (Req 11.14)
    if (approvedCount === 1 && nominalBayar !== sisaTagihan) {
      throw new BadRequestException(
        `Pembayaran kedua wajib melunasi seluruh sisa tagihan (Rp ${sisaTagihan.toLocaleString('id-ID')})`,
      );
    }

    // 9. Upload file to R2 storage
    const fileExtension = file.originalname.split('.').pop() || 'jpg';
    const storagePath = `${BUCKET_PATHS.BUKTI_TRANSFER}/${tagihanRecord.tenantId}/${tagihanId}/${randomUUID()}.${fileExtension}`;

    await this.storageService.upload(storagePath, file.buffer, file.mimetype);

    // 10. Create tagihan_transaksi record (Req 11.4, 11.7)
    const nomorReferensi = `BT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    const [transaksi] = await db
      .insert(tagihanTransaksi)
      .values({
        tenantId: tagihanRecord.tenantId,
        tagihanId,
        jumlahBayar: nominalBayar,
        metode: 'upload_bukti',
        status: 'pending',
        buktiTransferUrl: storagePath,
        uploadedBy: userId,
        nomorReferensi,
      })
      .returning();

    // 11. Update tagihan status to menunggu_verifikasi (Req 11.4)
    await db
      .update(tagihan)
      .set({
        status: 'menunggu_verifikasi',
        updatedAt: new Date(),
      })
      .where(eq(tagihan.id, tagihanId));

    // 12. Enqueue WebP compression job (Req 11.15)
    await this.imageQueue.add('compress-bukti-transfer', {
      transaksi_id: transaksi.id,
      storage_path: storagePath,
      tenant_id: tagihanRecord.tenantId,
      tagihan_id: tagihanId,
    });

    // 13. Record audit trail (Requirements: 29.1, 29.5)
    await this.auditTrailService.record({
      tenantId: tagihanRecord.tenantId,
      userId,
      jenisAksi: 'upload_bukti_transfer',
      entityType: 'tagihan',
      entityId: tagihanId,
      nilaiSebelum: { status: tagihanRecord.status },
      nilaiSesudah: {
        status: 'menunggu_verifikasi',
        nominal_bayar: nominalBayar,
      },
    });

    return {
      message: 'Bukti transfer berhasil dikirim dan menunggu verifikasi bendahara',
      transaksi_id: transaksi.id,
      nomor_referensi: nomorReferensi,
      nominal_bayar: nominalBayar,
      sisa_tagihan: sisaTagihan - nominalBayar,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // MANUAL PAYMENT RECORDING (Requirements: 13.1–13.7)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Record a manual payment (tunai/transfer_manual) by bendahara.
   *
   * Validations:
   * 1. Tagihan exists in this tenant (Req 13.1)
   * 2. Status is belum_bayar or cicilan (Req 13.2)
   * 3. jumlah_bayar > 0 and jumlah_bayar <= sisa tagihan (Req 13.7)
   *
   * On success:
   * - Create tagihan_transaksi (status: 'approved', verified_by: bendahara_id) (Req 13.5)
   * - Generate unique nomor_referensi (Req 14.4)
   * - Update tagihan.total_dibayar += jumlah_bayar
   * - Auto-transition: if total_dibayar >= nominal → status = 'lunas', else → status = 'cicilan' (Req 13.1, 13.2, 13.4)
   *
   * No limit on cicilan count for manual payments (Req 13.6).
   *
   * Requirements: 13.1–13.7
   */
  async recordManualPayment(
    tenantId: string,
    bendaharaId: string,
    tagihanId: string,
    dto: ManualPaymentDto,
  ) {
    const db = this.drizzleService.db;

    // 1. Find the tagihan in this tenant
    const [tagihanRecord] = await db
      .select()
      .from(tagihan)
      .where(and(eq(tagihan.id, tagihanId), eq(tagihan.tenantId, tenantId)))
      .limit(1);

    if (!tagihanRecord) {
      throw new NotFoundException('Tagihan tidak ditemukan');
    }

    // 2. Validate status allows manual payment (Req 13.1, 13.2)
    const allowedStatuses = ['belum_bayar', 'cicilan'];
    if (!allowedStatuses.includes(tagihanRecord.status)) {
      throw new BadRequestException(
        `Tidak dapat mencatat pembayaran untuk tagihan dengan status "${tagihanRecord.status}"`,
      );
    }

    // 3. Validate jumlah_bayar > 0 (already validated by DTO @Min(1))
    const jumlahBayar = dto.jumlah_bayar;

    // 4. Calculate sisa tagihan and validate amount doesn't exceed it (Req 13.7)
    const sisaTagihan = tagihanRecord.nominal - tagihanRecord.totalDibayar;
    if (jumlahBayar > sisaTagihan) {
      throw new BadRequestException(
        `Jumlah pembayaran (Rp ${jumlahBayar.toLocaleString('id-ID')}) melebihi sisa tagihan (Rp ${sisaTagihan.toLocaleString('id-ID')})`,
      );
    }

    // 5. Generate unique nomor_referensi (Req 14.4)
    const nomorReferensi = this.generateNomorReferensi(dto.metode);

    // 6. Create tagihan_transaksi record (status: 'approved' immediately — no verification needed)
    const [transaksi] = await db
      .insert(tagihanTransaksi)
      .values({
        tenantId,
        tagihanId,
        jumlahBayar,
        metode: dto.metode,
        status: 'approved',
        catatan: dto.catatan || null,
        verifiedBy: bendaharaId,
        verifiedAt: new Date(),
        nomorReferensi,
      })
      .returning();

    // 7. Update tagihan: total_dibayar and status
    const newTotalDibayar = tagihanRecord.totalDibayar + jumlahBayar;
    const newStatus = newTotalDibayar >= tagihanRecord.nominal ? 'lunas' : 'cicilan';

    await db
      .update(tagihan)
      .set({
        totalDibayar: newTotalDibayar,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(tagihan.id, tagihanId));

    // Record audit trail (Requirements: 29.1, 29.5)
    await this.auditTrailService.record({
      tenantId,
      userId: bendaharaId,
      jenisAksi: 'catat_pembayaran_manual',
      entityType: 'tagihan',
      entityId: tagihanId,
      nilaiSebelum: {
        status: tagihanRecord.status,
        total_dibayar: tagihanRecord.totalDibayar,
      },
      nilaiSesudah: {
        status: newStatus,
        total_dibayar: newTotalDibayar,
        jumlah_bayar: jumlahBayar,
        metode: dto.metode,
        nomor_referensi: nomorReferensi,
      },
    });

    return {
      message:
        newStatus === 'lunas'
          ? 'Pembayaran berhasil dicatat. Tagihan lunas.'
          : 'Pembayaran cicilan berhasil dicatat.',
      transaksi_id: transaksi.id,
      nomor_referensi: nomorReferensi,
      jumlah_bayar: jumlahBayar,
      total_dibayar: newTotalDibayar,
      sisa_tagihan: tagihanRecord.nominal - newTotalDibayar,
      status: newStatus,
    };
  }

  /**
   * Generate a unique nomor_referensi for a payment transaction.
   * Format: MP-{timestamp}-{random8chars} for manual payments.
   */
  generateNomorReferensi(metode: 'tunai' | 'transfer_manual'): string {
    const prefix = metode === 'tunai' ? 'TN' : 'TM';
    return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PAYMENT VERIFICATION (Requirements: 12.1–12.8)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Verify a payment (approve or reject) by bendahara.
   *
   * On approve:
   * - Set transaksi.status = 'approved'
   * - Update tagihan.total_dibayar += jumlah_bayar
   * - Determine tagihan final status:
   *   - If total_dibayar >= nominal → 'lunas'
   *   - If total_dibayar < nominal → 'cicilan'
   * - Send notification to parent (Req 12.7, 12.8)
   *
   * On reject:
   * - Set transaksi.status = 'rejected', record alasan_penolakan
   * - Set tagihan.status = 'ditolak'
   * - Send notification to parent with rejection reason (Req 12.5)
   *
   * Requirements: 12.1–12.8
   */
  async verifyPayment(
    tenantId: string,
    tagihanId: string,
    bendaharaId: string,
    dto: VerifyPaymentDto,
  ) {
    const db = this.drizzleService.db;

    // 1. Find tagihan
    const [tagihanRecord] = await db
      .select()
      .from(tagihan)
      .where(and(eq(tagihan.id, tagihanId), eq(tagihan.tenantId, tenantId)))
      .limit(1);

    if (!tagihanRecord) {
      throw new NotFoundException('Tagihan tidak ditemukan');
    }

    // 2. Tagihan must be in menunggu_verifikasi status
    if (tagihanRecord.status !== 'menunggu_verifikasi') {
      throw new BadRequestException(
        `Tagihan dengan status "${tagihanRecord.status}" tidak dapat diverifikasi`,
      );
    }

    // 3. Find the pending transaction for this tagihan
    const [pendingTransaksi] = await db
      .select()
      .from(tagihanTransaksi)
      .where(and(eq(tagihanTransaksi.tagihanId, tagihanId), eq(tagihanTransaksi.status, 'pending')))
      .limit(1);

    if (!pendingTransaksi) {
      throw new NotFoundException('Transaksi pending tidak ditemukan');
    }

    // 4. Validate rejection reason is provided when rejecting (Req 12.4)
    if (dto.action === 'reject' && !dto.alasan_penolakan) {
      throw new BadRequestException('Alasan penolakan wajib diisi');
    }

    // Get student info for notification
    const studentInfo = await this.getStudentInfo(tagihanRecord.siswaId);

    if (dto.action === 'approve') {
      // APPROVE flow
      const newTotalDibayar = tagihanRecord.totalDibayar + pendingTransaksi.jumlahBayar;
      const newStatus = newTotalDibayar >= tagihanRecord.nominal ? 'lunas' : 'cicilan';
      const sisaTagihan = tagihanRecord.nominal - newTotalDibayar;

      // Update transaksi status to approved
      await db
        .update(tagihanTransaksi)
        .set({
          status: 'approved',
          verifiedBy: bendaharaId,
          verifiedAt: new Date(),
        })
        .where(eq(tagihanTransaksi.id, pendingTransaksi.id));

      // Update tagihan total_dibayar and status
      await db
        .update(tagihan)
        .set({
          totalDibayar: newTotalDibayar,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(tagihan.id, tagihanId));

      // Send notification to parent (Req 12.7, 12.8)
      if (studentInfo?.orangTuaId) {
        await this.notificationQueue.add('send-verification-notification', {
          tenant_id: tenantId,
          orang_tua_id: studentInfo.orangTuaId,
          siswa_id: tagihanRecord.siswaId,
          siswa_nama: studentInfo.nama,
          action: 'approved',
          bulan: tagihanRecord.bulan,
          tahun: tagihanRecord.tahun,
          nominal_disetujui: pendingTransaksi.jumlahBayar,
          status_baru: newStatus,
          sisa_tagihan: sisaTagihan > 0 ? sisaTagihan : 0,
        });
      }

      // Record audit trail (Requirements: 29.1, 29.5)
      await this.auditTrailService.record({
        tenantId,
        userId: bendaharaId,
        jenisAksi: 'setujui_pembayaran',
        entityType: 'tagihan',
        entityId: tagihanId,
        nilaiSebelum: {
          status: tagihanRecord.status,
          total_dibayar: tagihanRecord.totalDibayar,
        },
        nilaiSesudah: {
          status: newStatus,
          total_dibayar: newTotalDibayar,
          nominal_disetujui: pendingTransaksi.jumlahBayar,
        },
      });

      return {
        message:
          newStatus === 'lunas'
            ? 'Pembayaran disetujui. Tagihan lunas.'
            : 'Pembayaran cicilan disetujui.',
        tagihan_id: tagihanId,
        transaksi_id: pendingTransaksi.id,
        status: newStatus,
        total_dibayar: newTotalDibayar,
        sisa_tagihan: sisaTagihan > 0 ? sisaTagihan : 0,
      };
    } else {
      // REJECT flow
      // Update transaksi status to rejected
      await db
        .update(tagihanTransaksi)
        .set({
          status: 'rejected',
          verifiedBy: bendaharaId,
          verifiedAt: new Date(),
          alasanPenolakan: dto.alasan_penolakan,
        })
        .where(eq(tagihanTransaksi.id, pendingTransaksi.id));

      // Update tagihan status to ditolak (Req 12.4)
      await db
        .update(tagihan)
        .set({
          status: 'ditolak',
          updatedAt: new Date(),
        })
        .where(eq(tagihan.id, tagihanId));

      // Send rejection notification to parent (Req 12.5)
      if (studentInfo?.orangTuaId) {
        await this.notificationQueue.add('send-verification-notification', {
          tenant_id: tenantId,
          orang_tua_id: studentInfo.orangTuaId,
          siswa_id: tagihanRecord.siswaId,
          siswa_nama: studentInfo.nama,
          action: 'rejected',
          bulan: tagihanRecord.bulan,
          tahun: tagihanRecord.tahun,
          alasan_penolakan: dto.alasan_penolakan,
        });
      }

      // Record audit trail (Requirements: 29.1, 29.5)
      await this.auditTrailService.record({
        tenantId,
        userId: bendaharaId,
        jenisAksi: 'tolak_pembayaran',
        entityType: 'tagihan',
        entityId: tagihanId,
        nilaiSebelum: { status: tagihanRecord.status },
        nilaiSesudah: { status: 'ditolak' },
        alasan: dto.alasan_penolakan,
      });

      return {
        message: 'Pembayaran ditolak.',
        tagihan_id: tagihanId,
        transaksi_id: pendingTransaksi.id,
        status: 'ditolak',
        alasan_penolakan: dto.alasan_penolakan,
      };
    }
  }

  /**
   * Get list of tagihan pending verification (status = menunggu_verifikasi).
   * Returns tagihan with preview of bukti transfer (presigned URL).
   *
   * Requirements: 12.1
   */
  async getPendingVerifications(tenantId: string) {
    const db = this.drizzleService.db;

    // Get all tagihan with status menunggu_verifikasi for this tenant
    const pendingTagihan = await db
      .select({
        id: tagihan.id,
        siswaId: tagihan.siswaId,
        bulan: tagihan.bulan,
        tahun: tagihan.tahun,
        nominal: tagihan.nominal,
        totalDibayar: tagihan.totalDibayar,
        status: tagihan.status,
        createdAt: tagihan.createdAt,
      })
      .from(tagihan)
      .where(and(eq(tagihan.tenantId, tenantId), eq(tagihan.status, 'menunggu_verifikasi')));

    if (pendingTagihan.length === 0) {
      return [];
    }

    // For each pending tagihan, get the pending transaction with bukti transfer
    const results = await Promise.all(
      pendingTagihan.map(async (t) => {
        // Get pending transaction
        const [transaksi] = await db
          .select()
          .from(tagihanTransaksi)
          .where(and(eq(tagihanTransaksi.tagihanId, t.id), eq(tagihanTransaksi.status, 'pending')))
          .limit(1);

        // Get student info
        const [studentRecord] = await db
          .select({ nama: siswa.nama, kelasId: siswa.kelasId })
          .from(siswa)
          .where(eq(siswa.id, t.siswaId))
          .limit(1);

        // Generate presigned URL for bukti transfer preview
        let buktiPreviewUrl: string | null = null;
        if (transaksi?.buktiTransferUrl) {
          try {
            buktiPreviewUrl = await this.storageService.getPresignedUrl(
              transaksi.buktiTransferUrl,
              300, // 5 minutes
            );
          } catch (err) {
            this.logger.warn(
              `Failed to generate presigned URL for transaksi ${transaksi.id}: ${err}`,
            );
          }
        }

        return {
          tagihan_id: t.id,
          siswa_id: t.siswaId,
          siswa_nama: studentRecord?.nama ?? null,
          bulan: t.bulan,
          tahun: t.tahun,
          nominal: t.nominal,
          total_dibayar: t.totalDibayar,
          sisa_tagihan: t.nominal - t.totalDibayar,
          transaksi: transaksi
            ? {
                id: transaksi.id,
                jumlah_bayar: transaksi.jumlahBayar,
                nomor_referensi: transaksi.nomorReferensi,
                bukti_preview_url: buktiPreviewUrl,
                created_at: transaksi.createdAt,
              }
            : null,
        };
      }),
    );

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private async processGeneration(
    tenantId: string,
    tahunAjaranId: string,
    months: { bulan: number; tahun: number }[],
  ): Promise<GenerateTagihanResult> {
    const db = this.drizzleService.db;

    // Get all active students with their kelas for this tenant + tahun_ajaran
    const activeStudents = await db
      .select({
        id: siswa.id,
        kelasId: siswa.kelasId,
        nama: siswa.nama,
        orangTuaId: siswa.orangTuaId,
        tingkat: kelas.tingkat,
      })
      .from(siswa)
      .innerJoin(kelas, eq(siswa.kelasId, kelas.id))
      .where(
        and(
          eq(siswa.tenantId, tenantId),
          eq(siswa.status, 'aktif'),
          eq(kelas.tahunAjaranId, tahunAjaranId),
        ),
      );

    if (activeStudents.length === 0) {
      return { created: 0, skipped: 0, total_nominal: 0, months_processed: months.length };
    }

    // Get nominal config per tingkat
    const nominalConfig = await this.getNominalConfig(tenantId);
    const tanggalJatuhTempo = await this.getTanggalJatuhTempo(tenantId);

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalNominal = 0;

    // Track new tagihan for notifications (grouped by parent)
    const newTagihanByParent = new Map<
      string,
      {
        siswaId: string;
        siswaNama: string;
        months: { bulan: number; tahun: number }[];
        nominal: number;
      }[]
    >();

    // Process students in chunks of CHUNK_SIZE
    for (let i = 0; i < activeStudents.length; i += CHUNK_SIZE) {
      const chunk = activeStudents.slice(i, i + CHUNK_SIZE);

      // Build all tagihan values for this chunk across all months
      const values: {
        tenantId: string;
        siswaId: string;
        bulan: number;
        tahun: number;
        tahunAjaranId: string;
        nominal: number;
        tanggalJatuhTempo: string;
      }[] = [];

      for (const student of chunk) {
        const nominal = this.getNominalFromConfig(nominalConfig, student.tingkat);

        for (const month of months) {
          values.push({
            tenantId,
            siswaId: student.id,
            bulan: month.bulan,
            tahun: month.tahun,
            tahunAjaranId,
            nominal,
            tanggalJatuhTempo: this.buildJatuhTempoDate(
              month.bulan,
              month.tahun,
              tanggalJatuhTempo,
            ),
          });
        }
      }

      if (values.length === 0) continue;

      // Batch INSERT with ON CONFLICT DO NOTHING
      const inserted = await db
        .insert(tagihan)
        .values(values)
        .onConflictDoNothing({
          target: [tagihan.siswaId, tagihan.bulan, tagihan.tahun],
        })
        .returning({
          id: tagihan.id,
          siswaId: tagihan.siswaId,
          bulan: tagihan.bulan,
          tahun: tagihan.tahun,
          nominal: tagihan.nominal,
        });

      totalCreated += inserted.length;
      totalSkipped += values.length - inserted.length;
      totalNominal += inserted.reduce((sum, t) => sum + t.nominal, 0);

      // Track created tagihan per parent for notification
      for (const row of inserted) {
        const student = chunk.find((s) => s.id === row.siswaId);
        if (student?.orangTuaId) {
          if (!newTagihanByParent.has(student.orangTuaId)) {
            newTagihanByParent.set(student.orangTuaId, []);
          }
          const existing = newTagihanByParent
            .get(student.orangTuaId)!
            .find((e) => e.siswaId === student.id);
          if (existing) {
            existing.months.push({ bulan: row.bulan, tahun: row.tahun });
          } else {
            newTagihanByParent.get(student.orangTuaId)!.push({
              siswaId: student.id,
              siswaNama: student.nama,
              months: [{ bulan: row.bulan, tahun: row.tahun }],
              nominal: row.nominal,
            });
          }
        }
      }
    }

    // Send notifications for newly created tagihan (Requirements: 10.5)
    // Fire-and-forget: notifications should not block the response or cause it to fail.
    if (newTagihanByParent.size > 0) {
      this.enqueueBatchTagihanNotifications(tenantId, newTagihanByParent, tanggalJatuhTempo).catch(
        (err) => {
          this.logger.warn(
            `Failed to enqueue tagihan notifications for tenant ${tenantId}: ${err.message}`,
          );
        },
      );
    }

    return {
      created: totalCreated,
      skipped: totalSkipped,
      total_nominal: totalNominal,
      months_processed: months.length,
    };
  }

  private async getTahunAjaran(tenantId: string, id: string) {
    const db = this.drizzleService.db;
    const results = await db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, id), eq(tahunAjaran.tenantId, tenantId)));

    if (results.length === 0) {
      throw new NotFoundException('Tahun ajaran tidak ditemukan');
    }
    return results[0];
  }

  private async getActiveTahunAjaran(tenantId: string) {
    const db = this.drizzleService.db;
    const results = await db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')));

    if (results.length === 0) {
      throw new NotFoundException('Tidak ada tahun ajaran aktif');
    }
    return results[0];
  }

  private async getKelasWithTingkat(tenantId: string, kelasId: string) {
    const db = this.drizzleService.db;
    const results = await db
      .select({ id: kelas.id, tingkat: kelas.tingkat })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)));

    if (results.length === 0) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }
    return results[0];
  }

  private async getNominalConfig(tenantId: string): Promise<Record<string, number>> {
    const config = await this.konfigurasiService.getConfigByKey(tenantId, 'nominal_spp');
    return config.value as Record<string, number>;
  }

  private getNominalFromConfig(config: Record<string, number>, tingkat: number): number {
    const key = `tingkat_${tingkat}`;
    return config[key] ?? DEFAULT_CONFIG.nominal_spp[key] ?? 250000;
  }

  private async getNominalForTingkat(tenantId: string, tingkat: number): Promise<number> {
    const config = await this.getNominalConfig(tenantId);
    return this.getNominalFromConfig(config, tingkat);
  }

  private async getTanggalJatuhTempo(tenantId: string): Promise<number> {
    try {
      const config = await this.konfigurasiService.getConfigByKey(tenantId, 'tanggal_jatuh_tempo');
      return (config.value as any).hari ?? 10;
    } catch {
      return 10; // default: tanggal 10 setiap bulan
    }
  }

  private buildJatuhTempoDate(bulan: number, tahun: number, hari: number): string {
    // Clamp day to last day of month
    const lastDay = new Date(tahun, bulan, 0).getDate();
    const day = Math.min(hari, lastDay);
    const mm = String(bulan).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${tahun}-${mm}-${dd}`;
  }

  private async getStudentInfo(siswaId: string) {
    const db = this.drizzleService.db;
    const results = await db
      .select({ id: siswa.id, nama: siswa.nama, orangTuaId: siswa.orangTuaId })
      .from(siswa)
      .where(eq(siswa.id, siswaId));

    return results[0] || null;
  }

  /**
   * Calculate all months between start and end dates (inclusive).
   */
  getMonthsInRange(startDate: string, endDate: string): { bulan: number; tahun: number }[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months: { bulan: number; tahun: number }[] = [];

    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endMonth) {
      months.push({
        bulan: current.getMonth() + 1, // 1-based
        tahun: current.getFullYear(),
      });
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  private async enqueueNewTagihanNotification(
    tenantId: string,
    orangTuaId: string,
    siswaId: string,
    siswaNama: string,
    inserted: { id: string; bulan: number; tahun: number }[],
    nominal: number,
    tanggalJatuhTempo: number,
  ): Promise<void> {
    await this.notificationQueue.add('send-new-tagihan-notification', {
      tenant_id: tenantId,
      orang_tua_id: orangTuaId,
      siswa_id: siswaId,
      siswa_nama: siswaNama,
      tagihan_list: inserted.map((t) => ({
        bulan: t.bulan,
        tahun: t.tahun,
        nominal,
        tanggal_jatuh_tempo: this.buildJatuhTempoDate(t.bulan, t.tahun, tanggalJatuhTempo),
      })),
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PAYMENT HISTORY & RECEIPT (Requirements: 14.1–14.6)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get all tagihan for a specific child (parent view).
   * Validates that the parent owns the child (siswa.orang_tua_id == userId).
   *
   * Returns: array of { id, bulan, tahun, nominal, status, total_dibayar, sisa, tanggal_jatuh_tempo }
   *
   * Requirements: 14.1, 14.2, 14.3
   */
  async getTagihanBySiswa(userId: string, siswaId: string) {
    const db = this.drizzleService.db;

    // 1. Validate parent owns this child
    const [siswaRecord] = await db
      .select()
      .from(siswa)
      .where(and(eq(siswa.id, siswaId), eq(siswa.orangTuaId, userId)))
      .limit(1);

    if (!siswaRecord) {
      throw new ForbiddenException('Anda tidak memiliki akses ke data siswa ini');
    }

    // 2. Fetch all tagihan for this child, ordered by year desc, month desc
    const tagihanList = await db
      .select({
        id: tagihan.id,
        bulan: tagihan.bulan,
        tahun: tagihan.tahun,
        nominal: tagihan.nominal,
        status: tagihan.status,
        totalDibayar: tagihan.totalDibayar,
        tanggalJatuhTempo: tagihan.tanggalJatuhTempo,
      })
      .from(tagihan)
      .where(eq(tagihan.siswaId, siswaId))
      .orderBy(tagihan.tahun, tagihan.bulan);

    // 3. Map to response format
    return tagihanList.map((t) => ({
      id: t.id,
      bulan: t.bulan,
      tahun: t.tahun,
      nominal: t.nominal,
      status: t.status,
      total_dibayar: t.totalDibayar,
      sisa: t.nominal - t.totalDibayar,
      tanggal_jatuh_tempo: t.tanggalJatuhTempo,
    }));
  }

  /**
   * Get payment receipt (bukti bayar) for a tagihan.
   * Returns JSON with payment details including nomor_referensi.
   * PDF generation will be implemented in task 18.3.
   *
   * Validates parent owns the child associated with this tagihan.
   *
   * Requirements: 14.4, 14.5, 14.6
   */
  async getBuktiBayar(userId: string, tagihanId: string) {
    const db = this.drizzleService.db;

    // 1. Find the tagihan
    const [tagihanRecord] = await db
      .select()
      .from(tagihan)
      .where(eq(tagihan.id, tagihanId))
      .limit(1);

    if (!tagihanRecord) {
      throw new NotFoundException('Tagihan tidak ditemukan');
    }

    // 2. Validate parent owns the child
    const [siswaRecord] = await db
      .select({
        id: siswa.id,
        nama: siswa.nama,
        kelasId: siswa.kelasId,
      })
      .from(siswa)
      .where(and(eq(siswa.id, tagihanRecord.siswaId), eq(siswa.orangTuaId, userId)))
      .limit(1);

    if (!siswaRecord) {
      throw new ForbiddenException('Anda tidak memiliki akses ke tagihan ini');
    }

    // 3. Get kelas info for the receipt
    let kelasNama = '-';
    if (siswaRecord.kelasId) {
      const [kelasRecord] = await db
        .select({ nama: kelas.nama })
        .from(kelas)
        .where(eq(kelas.id, siswaRecord.kelasId))
        .limit(1);
      if (kelasRecord) {
        kelasNama = kelasRecord.nama;
      }
    }

    // 4. Get ALL transactions for this tagihan (not just approved — parent should see full history)
    const transactions = await db
      .select()
      .from(tagihanTransaksi)
      .where(eq(tagihanTransaksi.tagihanId, tagihanId));

    // 5. Build response (return empty array if no transactions — don't throw 404)
    return {
      tagihan_id: tagihanRecord.id,
      siswa_nama: siswaRecord.nama,
      kelas: kelasNama,
      bulan: tagihanRecord.bulan,
      tahun: tagihanRecord.tahun,
      nominal_tagihan: tagihanRecord.nominal,
      status: tagihanRecord.status,
      pembayaran: transactions.map((t) => ({
        id: t.id,
        jumlah_bayar: t.jumlahBayar,
        nominal_bayar: t.jumlahBayar,
        tanggal_bayar: t.createdAt,
        created_at: t.createdAt,
        metode: t.metode,
        status: t.status,
        nomor_referensi: t.nomorReferensi,
        alasan_penolakan: t.alasanPenolakan,
        verified_at: t.verifiedAt,
      })),
    };
  }

  private async enqueueBatchTagihanNotifications(
    tenantId: string,
    byParent: Map<
      string,
      {
        siswaId: string;
        siswaNama: string;
        months: { bulan: number; tahun: number }[];
        nominal: number;
      }[]
    >,
    tanggalJatuhTempo: number,
  ): Promise<void> {
    // Enqueue notifications in parallel batches to avoid blocking the response.
    // Process in batches of 50 to avoid overwhelming Redis.
    const entries = Array.from(byParent.entries());
    const BATCH_SIZE = 50;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(([orangTuaId, children]) =>
          this.notificationQueue.add('send-new-tagihan-notification', {
            tenant_id: tenantId,
            orang_tua_id: orangTuaId,
            children: children.map((c) => ({
              siswa_id: c.siswaId,
              siswa_nama: c.siswaNama,
              tagihan_count: c.months.length,
              nominal: c.nominal,
              tanggal_jatuh_tempo: tanggalJatuhTempo,
            })),
          }),
        ),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAGIHAN MANAGEMENT — DELETE, EDIT, CANCEL (Requirements: 34.1–34.7)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Delete a tagihan — only allowed if status is 'belum_bayar'.
   * Records the deletion in audit_trail.
   *
   * Requirements: 34.1, 34.2, 34.7
   */
  async deleteTagihan(tenantId: string, userId: string, tagihanId: string): Promise<void> {
    const db = this.drizzleService.db;

    const [tagihanRecord] = await db
      .select()
      .from(tagihan)
      .where(and(eq(tagihan.id, tagihanId), eq(tagihan.tenantId, tenantId)))
      .limit(1);

    if (!tagihanRecord) {
      throw new NotFoundException('Tagihan tidak ditemukan');
    }

    if (tagihanRecord.status !== 'belum_bayar') {
      throw new BadRequestException(
        'Tagihan tidak dapat dihapus karena sudah ada aktivitas pembayaran',
      );
    }

    // Delete the tagihan
    await db.delete(tagihan).where(eq(tagihan.id, tagihanId));

    // Record in audit trail (Req 34.7)
    await this.auditTrailService.record({
      tenantId,
      userId,
      jenisAksi: 'hapus_tagihan',
      entityType: 'tagihan',
      entityId: tagihanId,
      nilaiSebelum: {
        nominal: tagihanRecord.nominal,
        bulan: tagihanRecord.bulan,
        tahun: tagihanRecord.tahun,
        status: tagihanRecord.status,
        siswa_id: tagihanRecord.siswaId,
      },
      nilaiSesudah: null,
      alasan: null,
    });
  }

  /**
   * Edit nominal of a tagihan — only allowed if status is 'belum_bayar'.
   * Records the edit in audit_trail.
   *
   * Requirements: 34.3, 34.4, 34.7
   */
  async editTagihan(tenantId: string, userId: string, tagihanId: string, dto: EditTagihanDto) {
    const db = this.drizzleService.db;

    const [tagihanRecord] = await db
      .select()
      .from(tagihan)
      .where(and(eq(tagihan.id, tagihanId), eq(tagihan.tenantId, tenantId)))
      .limit(1);

    if (!tagihanRecord) {
      throw new NotFoundException('Tagihan tidak ditemukan');
    }

    if (tagihanRecord.status !== 'belum_bayar') {
      throw new BadRequestException(
        'Nominal tidak dapat diubah karena sudah ada aktivitas pembayaran',
      );
    }

    const nominalSebelum = tagihanRecord.nominal;

    // Update nominal
    await db
      .update(tagihan)
      .set({ nominal: dto.nominal, updatedAt: new Date() })
      .where(eq(tagihan.id, tagihanId));

    // Record in audit trail (Req 34.7)
    await this.auditTrailService.record({
      tenantId,
      userId,
      jenisAksi: 'edit_tagihan',
      entityType: 'tagihan',
      entityId: tagihanId,
      nilaiSebelum: { nominal: nominalSebelum },
      nilaiSesudah: { nominal: dto.nominal },
      alasan: null,
    });

    return {
      message: 'Nominal tagihan berhasil diubah',
      tagihan_id: tagihanId,
      nominal_sebelum: nominalSebelum,
      nominal_sesudah: dto.nominal,
    };
  }

  /**
   * Cancel a tagihan (set status = 'dibatalkan') — only if status is 'belum_bayar'.
   * Requires alasan (reason). Records the cancellation in audit_trail.
   *
   * Requirements: 34.5, 34.6, 34.7
   */
  async cancelTagihan(tenantId: string, userId: string, tagihanId: string, dto: CancelTagihanDto) {
    const db = this.drizzleService.db;

    const [tagihanRecord] = await db
      .select()
      .from(tagihan)
      .where(and(eq(tagihan.id, tagihanId), eq(tagihan.tenantId, tenantId)))
      .limit(1);

    if (!tagihanRecord) {
      throw new NotFoundException('Tagihan tidak ditemukan');
    }

    if (tagihanRecord.status !== 'belum_bayar') {
      throw new BadRequestException(
        'Tagihan tidak dapat dibatalkan karena sudah ada aktivitas pembayaran',
      );
    }

    // Update status to dibatalkan and record alasan
    await db
      .update(tagihan)
      .set({
        status: 'dibatalkan',
        alasanPembatalan: dto.alasan,
        updatedAt: new Date(),
      })
      .where(eq(tagihan.id, tagihanId));

    // Record in audit trail (Req 34.7)
    await this.auditTrailService.record({
      tenantId,
      userId,
      jenisAksi: 'batalkan_tagihan',
      entityType: 'tagihan',
      entityId: tagihanId,
      nilaiSebelum: { status: 'belum_bayar' },
      nilaiSesudah: { status: 'dibatalkan' },
      alasan: dto.alasan,
    });

    return {
      message: 'Tagihan berhasil dibatalkan',
      tagihan_id: tagihanId,
      status: 'dibatalkan',
      alasan: dto.alasan,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAGIHAN LIST (GET /tagihan)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * List all tagihan with cursor-pagination and filters.
   * Supports: status, kelas_id, bulan, tahun, search (by student name).
   */
  async listTagihan(tenantId: string, query: ListTagihanQueryDto) {
    const db = this.drizzleService.db;
    const limit = query.limit ?? 20;
    const conditions: any[] = [eq(tagihan.tenantId, tenantId)];

    if (query.status) {
      conditions.push(eq(tagihan.status, query.status as any));
    }
    if (query.kelas_id) {
      conditions.push(eq(siswa.kelasId, query.kelas_id));
    }
    if (query.bulan) {
      conditions.push(eq(tagihan.bulan, query.bulan));
    }
    if (query.tahun) {
      conditions.push(eq(tagihan.tahun, query.tahun));
    }

    // Cursor-based pagination
    if (query.cursor) {
      const [cursorRecord] = await db
        .select({ createdAt: tagihan.createdAt, id: tagihan.id })
        .from(tagihan)
        .where(eq(tagihan.id, query.cursor))
        .limit(1);

      if (cursorRecord && cursorRecord.createdAt) {
        conditions.push(
          or(
            sql`${tagihan.createdAt} < ${cursorRecord.createdAt}`,
            and(eq(tagihan.createdAt, cursorRecord.createdAt), gt(tagihan.id, cursorRecord.id)),
          )!,
        );
      }
    }

    const results = await db
      .select({
        id: tagihan.id,
        siswaId: tagihan.siswaId,
        bulan: tagihan.bulan,
        tahun: tagihan.tahun,
        nominal: tagihan.nominal,
        totalDibayar: tagihan.totalDibayar,
        status: tagihan.status,
        tanggalJatuhTempo: tagihan.tanggalJatuhTempo,
        createdAt: tagihan.createdAt,
        siswa_nama: siswa.nama,
        kelas_nama: kelas.nama,
      })
      .from(tagihan)
      .innerJoin(siswa, eq(tagihan.siswaId, siswa.id))
      .leftJoin(kelas, eq(siswa.kelasId, kelas.id))
      .where(and(...conditions))
      .orderBy(sql`${tagihan.createdAt} DESC`)
      .limit(limit + 1);

    const hasNext = results.length > limit;
    const data = results.slice(0, limit);
    const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].id : null;

    return {
      data: data.map((row) => ({
        id: row.id,
        siswa_id: row.siswaId,
        siswa_nama: row.siswa_nama,
        kelas_nama: row.kelas_nama,
        bulan: row.bulan,
        tahun: row.tahun,
        nominal: row.nominal,
        total_dibayar: row.totalDibayar,
        status: row.status,
        tanggal_jatuh_tempo: row.tanggalJatuhTempo,
        created_at: row.createdAt,
      })),
      meta: {
        has_next: hasNext,
        cursor: nextCursor,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TUNGGAKAN DASHBOARD (Requirements: 15.1–15.5)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get summary stats of tunggakan for the dashboard widget.
   */
  async getTunggakanSummary(tenantId: string, kelasId?: string) {
    const db = this.drizzleService.db;
    const conditions: any[] = [
      eq(tagihan.tenantId, tenantId),
      or(eq(tagihan.status, 'belum_bayar'), eq(tagihan.status, 'cicilan')),
    ];

    if (kelasId) {
      conditions.push(eq(siswa.kelasId, kelasId));
    }

    const [result] = await db
      .select({
        total_tunggakan: sql<number>`COALESCE(SUM(${tagihan.nominal} - ${tagihan.totalDibayar}), 0)`,
        total_siswa: sql<number>`COUNT(DISTINCT ${tagihan.siswaId})`,
        total_tagihan: sql<number>`COUNT(*)`,
      })
      .from(tagihan)
      .innerJoin(siswa, eq(tagihan.siswaId, siswa.id))
      .where(and(...conditions));

    return {
      total_tunggakan: Number(result?.total_tunggakan ?? 0),
      total_siswa: Number(result?.total_siswa ?? 0),
      total_tagihan: Number(result?.total_tagihan ?? 0),
    };
  }

  /**
   * Get list of unpaid tagihan (belum_bayar or cicilan) sorted by jatuh_tempo ASC.
   * Includes student info (nama, kelas). Includes pindah_sekolah/keluar students.
   * Supports cursor-based pagination and optional kelas filter.
   *
   * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
   */
  async getTunggakan(tenantId: string, query: GetTunggakanQueryDto) {
    const db = this.drizzleService.db;
    const { kelas_id, cursor, limit = 20 } = query;

    // Build WHERE conditions
    const conditions = [
      eq(tagihan.tenantId, tenantId),
      or(eq(tagihan.status, 'belum_bayar'), eq(tagihan.status, 'cicilan')),
    ];

    // Filter by kelas if specified (Req 15.4)
    if (kelas_id) {
      conditions.push(eq(siswa.kelasId, kelas_id));
    }

    // Cursor-based pagination: filter records after the cursor's jatuh_tempo
    if (cursor) {
      // Fetch cursor record to get its tanggal_jatuh_tempo for ordering
      const [cursorRecord] = await db
        .select({ tanggalJatuhTempo: tagihan.tanggalJatuhTempo, id: tagihan.id })
        .from(tagihan)
        .where(eq(tagihan.id, cursor))
        .limit(1);

      if (cursorRecord) {
        // Records with later jatuh_tempo, or same jatuh_tempo but later ID (for stable sort)
        conditions.push(
          or(
            gt(tagihan.tanggalJatuhTempo, cursorRecord.tanggalJatuhTempo!),
            and(
              eq(tagihan.tanggalJatuhTempo, cursorRecord.tanggalJatuhTempo!),
              gt(tagihan.id, cursorRecord.id),
            ),
          )!,
        );
      }
    }

    // Query with JOIN to siswa and kelas tables
    // Include students with status pindah_sekolah/keluar (Req 15.5)
    const results = await db
      .select({
        id: tagihan.id,
        siswaId: tagihan.siswaId,
        bulan: tagihan.bulan,
        tahun: tagihan.tahun,
        nominal: tagihan.nominal,
        totalDibayar: tagihan.totalDibayar,
        status: tagihan.status,
        tanggalJatuhTempo: tagihan.tanggalJatuhTempo,
        siswa_nama: siswa.nama,
        siswa_status: siswa.status,
        kelas_id: kelas.id,
        kelas_nama: kelas.nama,
      })
      .from(tagihan)
      .innerJoin(siswa, eq(tagihan.siswaId, siswa.id))
      .leftJoin(kelas, eq(siswa.kelasId, kelas.id))
      .where(and(...conditions))
      .orderBy(asc(tagihan.tanggalJatuhTempo), asc(tagihan.id))
      .limit(limit + 1); // Fetch one extra to determine if there's a next page

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Calculate total nominal tunggakan for summary (Req 15.2)
    const totalResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${tagihan.nominal} - ${tagihan.totalDibayar}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tagihan)
      .innerJoin(siswa, eq(tagihan.siswaId, siswa.id))
      .where(
        and(
          eq(tagihan.tenantId, tenantId),
          or(eq(tagihan.status, 'belum_bayar'), eq(tagihan.status, 'cicilan')),
          ...(kelas_id ? [eq(siswa.kelasId, kelas_id)] : []),
        ),
      );

    return {
      items: items.map((row) => ({
        id: row.id,
        siswa_id: row.siswaId,
        siswa_nama: row.siswa_nama,
        siswa_status: row.siswa_status,
        kelas_id: row.kelas_id,
        kelas_nama: row.kelas_nama,
        bulan: row.bulan,
        tahun: row.tahun,
        nominal: row.nominal,
        total_dibayar: row.totalDibayar,
        sisa_tagihan: row.nominal - row.totalDibayar,
        status: row.status,
        tanggal_jatuh_tempo: row.tanggalJatuhTempo,
      })),
      total_tunggakan: Number(totalResult[0]?.total ?? 0),
      total_count: Number(totalResult[0]?.count ?? 0),
      next_cursor: nextCursor,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // EXPORT (Requirements: 15.6–15.8)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Enqueue an export job for billing data (tunggakan or period-based report).
   * Returns job_id so client can poll for completion.
   *
   * Export payload: { tenantId, format, periode_bulan, periode_tahun, requestedBy }
   * Data included: nama siswa, kelas, bulan, nominal, status, tanggal bayar (Req 15.8)
   *
   * Requirements: 15.6, 15.7, 15.8
   */
  async exportTagihan(
    tenantId: string,
    userId: string,
    query: ExportTagihanQueryDto,
  ): Promise<{ job_id: string; message: string }> {
    const { format, periode_bulan, periode_tahun } = query;

    const job = await this.exportQueue.add('export-tagihan', {
      tenantId,
      format,
      periode_bulan,
      periode_tahun,
      requestedBy: userId,
    });

    return {
      job_id: String(job.id),
      message: 'Export tagihan sedang diproses. Silakan cek status export secara berkala.',
    };
  }
}

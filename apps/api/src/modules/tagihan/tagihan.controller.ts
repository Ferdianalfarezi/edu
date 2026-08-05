import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Auditable, AuditInterceptor } from '@/modules/audit-log';
import { TagihanService } from './tagihan.service';
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

@Controller('tagihan')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagihanController {
  constructor(private readonly tagihanService: TagihanService) {}

  /**
   * GET /tagihan
   * List all tagihan with cursor-pagination and filters.
   * Bendahara and Admin only.
   */
  @Get()
  @Roles(Role.BENDAHARA, Role.ADMIN)
  async listTagihan(@TenantId() tenantId: string, @Query() query: ListTagihanQueryDto) {
    const data = await this.tagihanService.listTagihan(tenantId, query);
    return data;
  }

  /**
   * POST /tagihan/generate
   * Generate tagihan SPP for active students.
   * Bendahara and Admin only.
   *
   * Requirements: 9.1–9.7, 10.1–10.5
   */
  @Post('generate')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  @Auditable({
    entityType: 'tagihan',
    action: 'create',
    entityIdSource: 'response.id',
    strictMode: true,
    excludeFields: ['bukti_transfer_url'],
  })
  @UseInterceptors(AuditInterceptor)
  async generateTagihan(@TenantId() tenantId: string, @Body() dto: GenerateTagihanDto) {
    const result = await this.tagihanService.generateTagihan(tenantId, dto);
    return {
      message: 'Tagihan berhasil di-generate',
      data: result,
    };
  }

  /**
   * GET /tagihan/verifikasi
   * List all pending verifications with bukti transfer preview.
   * Bendahara and Admin only.
   *
   * Requirements: 12.1
   */
  @Get('verifikasi')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  async getPendingVerifications(@TenantId() tenantId: string) {
    const data = await this.tagihanService.getPendingVerifications(tenantId);
    return { data };
  }

  /**
   * GET /tagihan/tunggakan/summary
   * Get summary of tunggakan (total count, total amount) for dashboard.
   * Bendahara, Admin, and Kepala Sekolah only.
   */
  @Get('tunggakan/summary')
  @Roles(Role.BENDAHARA, Role.KEPALA_SEKOLAH, Role.ADMIN)
  async getTunggakanSummary(@TenantId() tenantId: string, @Query('kelas_id') kelasId?: string) {
    const data = await this.tagihanService.getTunggakanSummary(tenantId, kelasId);
    return data;
  }

  /**
   * GET /tagihan/tunggakan
   * List belum_bayar/cicilan tagihan, sorted by jatuh_tempo oldest first.
   * Supports cursor pagination and kelas_id filter.
   * Includes students with status pindah_sekolah/keluar.
   * Bendahara, Admin, and Kepala Sekolah only.
   *
   * Requirements: 15.1–15.5
   */
  @Get('tunggakan')
  @Roles(Role.BENDAHARA, Role.KEPALA_SEKOLAH, Role.ADMIN)
  async getTunggakan(@TenantId() tenantId: string, @Query() query: GetTunggakanQueryDto) {
    const result = await this.tagihanService.getTunggakan(tenantId, query);
    return {
      data: result.items,
      total_tunggakan: result.total_tunggakan,
      total_count: result.total_count,
      next_cursor: result.next_cursor,
    };
  }

  /**
   * GET /tagihan/export
   * Export tagihan list as XLSX or PDF file download.
   * Supports same filters as GET /tagihan list.
   * Max 10.000 rows. Bendahara and Admin.
   *
   * Requirements: 9.1, 9.3, 9.4
   */
  @Get('export')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  async exportTagihanFile(
    @TenantId() tenantId: string,
    @Query() query: ExportTagihanQueryDto,
    @Res() res: Response,
  ) {
    const { format, status, kelas_id, bulan, tahun, search } = query;
    const { buffer, filename } = await this.tagihanService.exportTagihanFile(
      { status, kelas_id, bulan, tahun, search },
      format,
      tenantId,
    );
    const mimeType =
      format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /**
   * GET /tagihan/tunggakan/export
   * Export tunggakan list as XLSX or PDF file download.
   * Supports kelas_id filter. Max 10.000 rows. Bendahara and Admin.
   *
   * Requirements: 9.2, 9.3, 9.4
   */
  @Get('tunggakan/export')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  async exportTunggakanFile(
    @TenantId() tenantId: string,
    @Query() query: ExportTagihanQueryDto,
    @Res() res: Response,
  ) {
    const { format, kelas_id } = query;
    const { buffer, filename } = await this.tagihanService.exportTunggakan(
      { kelas_id },
      format,
      tenantId,
    );
    const mimeType =
      format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /**
   * GET /tagihan/siswa/:siswaId
   * Get all tagihan for a specific child (orang_tua view).
   * Validates parent owns the child.
   *
   * Requirements: 14.1, 14.2, 14.3
   */
  @Get('siswa/:siswaId')
  @Roles(Role.ORANG_TUA)
  async getTagihanBySiswa(
    @CurrentUser('id') userId: string,
    @Param('siswaId', ParseUUIDPipe) siswaId: string,
  ) {
    const data = await this.tagihanService.getTagihanBySiswa(userId, siswaId);
    return { data };
  }

  /**
   * GET /tagihan/:id/bukti-bayar
   * Get payment receipt info (JSON) for a specific tagihan.
   * PDF generation deferred to task 18.3.
   *
   * Requirements: 14.4, 14.5, 14.6
   */
  @Get(':id/bukti-bayar')
  @Roles(Role.ORANG_TUA)
  async getBuktiBayar(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) tagihanId: string,
  ) {
    const data = await this.tagihanService.getBuktiBayar(userId, tagihanId);
    return { data };
  }

  /**
   * PATCH /tagihan/:id/verify
   * Approve or reject a pending payment.
   * Bendahara and Admin.
   *
   * Requirements: 12.1–12.8
   */
  @Patch(':id/verify')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  @Auditable({
    entityType: 'pembayaran',
    action: 'update',
    entityIdSource: 'params.id',
    strictMode: true,
    excludeFields: ['bukti_transfer_url'],
  })
  @UseInterceptors(AuditInterceptor)
  async verifyPayment(
    @CurrentUser('id') bendaharaId: string,
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) tagihanId: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.tagihanService.verifyPayment(tenantId, tagihanId, bendaharaId, dto);
  }

  /**
   * POST /tagihan/:id/upload-bukti
   * Upload bukti transfer for a tagihan (orang_tua only).
   * Multipart/form-data with file (image) and nominal_bayar (number).
   *
   * Requirements: 11.1–11.17
   */
  @Post(':id/upload-bukti')
  @Roles(Role.ORANG_TUA)
  @Auditable({
    entityType: 'pembayaran',
    action: 'create',
    entityIdSource: 'response.id',
    strictMode: true,
    excludeFields: ['bukti_transfer_url'],
  })
  @UseInterceptors(AuditInterceptor, FileInterceptor('file'))
  async uploadBuktiTransfer(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) tagihanId: string,
    @Body() dto: UploadBuktiDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File bukti transfer wajib diupload');
    }

    return this.tagihanService.uploadBuktiTransfer(userId, tagihanId, dto, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
    });
  }

  /**
   * POST /tagihan/:id/manual-payment
   * Record a manual payment (tunai/transfer_manual) by bendahara or admin.
   * No file upload needed — the staff records the payment directly.
   *
   * Requirements: 13.1–13.7
   */
  @Post(':id/manual-payment')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  @Auditable({
    entityType: 'pembayaran',
    action: 'create',
    entityIdSource: 'response.id',
    strictMode: true,
    excludeFields: ['bukti_transfer_url'],
  })
  @UseInterceptors(AuditInterceptor)
  async recordManualPayment(
    @CurrentUser('id') bendaharaId: string,
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) tagihanId: string,
    @Body() dto: ManualPaymentDto,
  ) {
    return this.tagihanService.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);
  }

  /**
   * DELETE /tagihan/:id
   * Delete a tagihan — only if status is belum_bayar.
   * Bendahara and Admin. Records action in audit trail.
   *
   * Requirements: 34.1, 34.2, 34.7
   */
  @Delete(':id')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  @Auditable({
    entityType: 'tagihan',
    action: 'delete',
    entityIdSource: 'params.id',
    strictMode: true,
    excludeFields: ['bukti_transfer_url'],
  })
  @UseInterceptors(AuditInterceptor)
  async deleteTagihan(
    @CurrentUser('id') bendaharaId: string,
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) tagihanId: string,
  ) {
    await this.tagihanService.deleteTagihan(tenantId, bendaharaId, tagihanId);
    return { message: 'Tagihan berhasil dihapus' };
  }

  /**
   * PATCH /tagihan/:id
   * Edit nominal of a tagihan — only if status is belum_bayar.
   * Bendahara and Admin. Records action in audit trail.
   *
   * Requirements: 34.3, 34.4, 34.7
   */
  @Patch(':id')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  @Auditable({
    entityType: 'tagihan',
    action: 'update',
    entityIdSource: 'params.id',
    strictMode: true,
    excludeFields: ['bukti_transfer_url'],
  })
  @UseInterceptors(AuditInterceptor)
  async editTagihan(
    @CurrentUser('id') bendaharaId: string,
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) tagihanId: string,
    @Body() dto: EditTagihanDto,
  ) {
    return this.tagihanService.editTagihan(tenantId, bendaharaId, tagihanId, dto);
  }

  /**
   * PATCH /tagihan/:id/cancel
   * Cancel a tagihan with required alasan — only if status is belum_bayar.
   * Bendahara and Admin. Records action in audit trail.
   *
   * Requirements: 34.5, 34.6, 34.7
   */
  @Patch(':id/cancel')
  @Roles(Role.BENDAHARA, Role.ADMIN)
  async cancelTagihan(
    @CurrentUser('id') bendaharaId: string,
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) tagihanId: string,
    @Body() dto: CancelTagihanDto,
  ) {
    return this.tagihanService.cancelTagihan(tenantId, bendaharaId, tagihanId, dto);
  }
}

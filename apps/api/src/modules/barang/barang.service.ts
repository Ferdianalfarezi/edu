import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { barang } from '@/drizzle/schema/barang';
import { paginate } from '../../common/utils/paginate';
import { PaginatedResponse } from '../../common/interfaces/pagination.interface';
import { CreateBarangDto } from './dto/create-barang.dto';
import { UpdateBarangDto } from './dto/update-barang.dto';
import { ListBarangQueryDto } from './dto/list-barang-query.dto';
import { BarangResponseDto } from './dto';

/**
 * Service layer untuk modul Pencatatan Barang.
 *
 * Requirements: 1.2, 1.3, 1.4, 1.8, 2.2, 2.3, 2.4, 2.6, 3.2, 3.4, 4.2, 4.3, 4.4, 4.6, 5.5, 5.6
 */
@Injectable()
export class BarangService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async create(tenantId: string, dto: CreateBarangDto): Promise<BarangResponseDto> {
    const [created] = await this.db
      .insert(barang)
      .values({
        tenantId,
        nama: dto.nama,
        deskripsi: dto.deskripsi ?? null,
        jumlah: dto.jumlah,
      })
      .returning();

    return this.toResponseDto(created);
  }

  async findAll(
    tenantId: string,
    query: ListBarangQueryDto,
  ): Promise<PaginatedResponse<BarangResponseDto>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 15;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(barang.tenantId, tenantId), isNull(barang.deletedAt)];

    if (query.search) {
      conditions.push(ilike(barang.nama, `%${query.search}%`));
    }

    const [countResult, dataResult] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(barang)
        .where(and(...conditions)),
      this.db
        .select()
        .from(barang)
        .where(and(...conditions))
        .orderBy(desc(barang.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const totalCount = countResult[0]?.count ?? 0;
    const data = dataResult.map((item) => this.toResponseDto(item));

    return paginate(data, totalCount, page, pageSize);
  }

  async findOne(tenantId: string, id: string): Promise<BarangResponseDto> {
    const [result] = await this.db
      .select()
      .from(barang)
      .where(and(eq(barang.id, id), eq(barang.tenantId, tenantId), isNull(barang.deletedAt)));

    if (!result) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    return this.toResponseDto(result);
  }

  async update(tenantId: string, id: string, dto: UpdateBarangDto): Promise<BarangResponseDto> {
    // Ensure the barang exists and belongs to this tenant
    await this.findOne(tenantId, id);

    // Whitespace-only detection on nama
    if (dto.nama !== undefined && dto.nama.trim() === '') {
      throw new BadRequestException('Nama barang tidak boleh hanya berisi whitespace');
    }

    const [updated] = await this.db
      .update(barang)
      .set({
        ...(dto.nama !== undefined && { nama: dto.nama }),
        ...(dto.deskripsi !== undefined && { deskripsi: dto.deskripsi }),
        ...(dto.jumlah !== undefined && { jumlah: dto.jumlah }),
        updatedAt: new Date(),
      })
      .where(eq(barang.id, id))
      .returning();

    return this.toResponseDto(updated);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    // Ensure the barang exists and belongs to this tenant
    await this.findOne(tenantId, id);

    await this.db.update(barang).set({ deletedAt: new Date() }).where(eq(barang.id, id));
  }

  private toResponseDto(record: typeof barang.$inferSelect): BarangResponseDto {
    return {
      id: record.id,
      nama: record.nama,
      deskripsi: record.deskripsi,
      jumlah: record.jumlah,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

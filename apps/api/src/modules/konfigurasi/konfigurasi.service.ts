import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, between, sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { konfigurasiSekolah } from '@/drizzle/schema/konfigurasi';
import { hariLibur } from '@/drizzle/schema/konfigurasi';
import { CreateHariLiburDto } from './dto';

/**
 * Default configuration values.
 * Applied when a key is not stored in the database for a tenant.
 *
 * Requirements: 22.2, 22.4
 */
export const DEFAULT_CONFIG: Record<string, any> = {
  threshold_alpa: { value: 10 },
  nominal_spp: {
    tingkat_1: 250000,
    tingkat_2: 275000,
    tingkat_3: 300000,
    tingkat_4: 325000,
    tingkat_5: 350000,
    tingkat_6: 375000,
  },
  tanggal_jatuh_tempo: { hari: 10 },
};

export interface KonfigurasiItem {
  key: string;
  value: any;
}

@Injectable()
export class KonfigurasiService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Get all config keys for a tenant with defaults applied for missing keys.
   * Requirements: 22.1, 22.4
   */
  async getAllConfig(tenantId: string): Promise<KonfigurasiItem[]> {
    const stored = await this.db
      .select({ key: konfigurasiSekolah.key, value: konfigurasiSekolah.value })
      .from(konfigurasiSekolah)
      .where(eq(konfigurasiSekolah.tenantId, tenantId));

    const storedMap = new Map(stored.map((s) => [s.key, s.value]));

    // Merge defaults with stored values (stored values override defaults)
    const result: KonfigurasiItem[] = [];

    // Add all default keys with stored values (or default if missing)
    for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
      result.push({
        key,
        value: storedMap.has(key) ? storedMap.get(key) : defaultValue,
      });
    }

    // Add any custom keys stored in DB that are not in defaults
    for (const [key, value] of storedMap) {
      if (!DEFAULT_CONFIG[key]) {
        result.push({ key, value });
      }
    }

    return result;
  }

  /**
   * Get a single config value for a tenant with default fallback.
   * Requirements: 22.1, 22.4
   */
  async getConfigByKey(tenantId: string, key: string): Promise<KonfigurasiItem> {
    const stored = await this.db
      .select({ key: konfigurasiSekolah.key, value: konfigurasiSekolah.value })
      .from(konfigurasiSekolah)
      .where(and(eq(konfigurasiSekolah.tenantId, tenantId), eq(konfigurasiSekolah.key, key)));

    if (stored.length > 0) {
      return { key: stored[0].key, value: stored[0].value };
    }

    // Fallback to default
    if (DEFAULT_CONFIG[key] !== undefined) {
      return { key, value: DEFAULT_CONFIG[key] };
    }

    throw new NotFoundException(`Konfigurasi dengan key '${key}' tidak ditemukan`);
  }

  /**
   * Upsert a config value (INSERT ON CONFLICT UPDATE).
   * Requirements: 22.3
   */
  async upsertConfig(tenantId: string, key: string, value: any): Promise<KonfigurasiItem> {
    const result = await this.db
      .insert(konfigurasiSekolah)
      .values({
        tenantId,
        key,
        value,
      })
      .onConflictDoUpdate({
        target: [konfigurasiSekolah.tenantId, konfigurasiSekolah.key],
        set: {
          value,
          updatedAt: new Date(),
        },
      })
      .returning({ key: konfigurasiSekolah.key, value: konfigurasiSekolah.value });

    return { key: result[0].key, value: result[0].value };
  }

  /**
   * Bulk upsert multiple config keys at once.
   * Requirements: 22.3
   */
  async bulkUpsertConfig(
    tenantId: string,
    items: { key: string; value: any }[],
  ): Promise<KonfigurasiItem[]> {
    const results: KonfigurasiItem[] = [];
    for (const item of items) {
      const result = await this.upsertConfig(tenantId, item.key, item.value);
      results.push(result);
    }
    return results;
  }

  // ─── Hari Libur ──────────────────────────────────────────────

  /**
   * List all holidays for a tenant, optionally filtered by year.
   * Requirements: 22.5
   */
  async getHariLibur(
    tenantId: string,
    year?: number,
  ): Promise<{ id: string; tanggal: string; keterangan: string | null }[]> {
    const currentYear = year ?? new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    const holidays = await this.db
      .select({
        id: hariLibur.id,
        tanggal: hariLibur.tanggal,
        keterangan: hariLibur.keterangan,
      })
      .from(hariLibur)
      .where(and(eq(hariLibur.tenantId, tenantId), between(hariLibur.tanggal, startDate, endDate)))
      .orderBy(hariLibur.tanggal);

    return holidays;
  }

  /**
   * Create a holiday entry.
   * Requirements: 22.5
   */
  async createHariLibur(
    tenantId: string,
    dto: CreateHariLiburDto,
  ): Promise<{ id: string; tanggal: string; keterangan: string | null }> {
    try {
      const result = await this.db
        .insert(hariLibur)
        .values({
          tenantId,
          tanggal: dto.tanggal,
          keterangan: dto.keterangan ?? null,
        })
        .returning({
          id: hariLibur.id,
          tanggal: hariLibur.tanggal,
          keterangan: hariLibur.keterangan,
        });

      return result[0];
    } catch (error: any) {
      // Handle unique constraint violation (duplicate date for tenant)
      if (error?.code === '23505') {
        throw new ConflictException(`Hari libur pada tanggal ${dto.tanggal} sudah terdaftar`);
      }
      throw error;
    }
  }

  /**
   * Delete a holiday entry.
   * Requirements: 22.5
   */
  async deleteHariLibur(tenantId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(hariLibur)
      .where(and(eq(hariLibur.id, id), eq(hariLibur.tenantId, tenantId)))
      .returning({ id: hariLibur.id });

    if (result.length === 0) {
      throw new NotFoundException('Hari libur tidak ditemukan');
    }
  }
}

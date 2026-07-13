import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';

export interface TenantSummary {
  id: string;
  nama: string;
  isActive: boolean;
  userCount: number;
  studentCount: number;
  unpaidAmount: number;
  hasOverdueInvoices: boolean;
}

export interface CrossTenantMetrics {
  overview: {
    totalTenants: number;
    activeTenants: number;
    inactiveTenants: number;
    totalUsers: number;
    totalStudents: number;
    totalUnpaidInvoices: number;
  };
  tenants: TenantSummary[];
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async getCrossTenantMetrics(): Promise<CrossTenantMetrics> {
    // Overview metrics — single query with subselects for efficiency
    const overviewResult = await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM tenant) AS total_tenants,
        (SELECT COUNT(*) FROM tenant WHERE is_active = true) AS active_tenants,
        (SELECT COUNT(*) FROM tenant WHERE is_active = false) AS inactive_tenants,
        (SELECT COUNT(*) FROM "user" WHERE is_active = true) AS total_users,
        (SELECT COUNT(*) FROM siswa WHERE status = 'aktif') AS total_students,
        (SELECT COUNT(*) FROM tagihan WHERE status IN ('belum_bayar', 'cicilan')) AS total_unpaid_invoices
    `);

    const overview = overviewResult.rows[0] as Record<string, string>;

    // Per-tenant breakdown with correlated subqueries
    const tenantsResult = await this.db.execute(sql`
      SELECT
        t.id,
        t.nama,
        t.is_active,
        COALESCE((SELECT COUNT(*) FROM "user" u WHERE u.tenant_id = t.id AND u.is_active = true), 0) AS user_count,
        COALESCE((SELECT COUNT(*) FROM siswa s WHERE s.tenant_id = t.id AND s.status = 'aktif'), 0) AS student_count,
        COALESCE((SELECT SUM(tg.nominal - tg.total_dibayar) FROM tagihan tg WHERE tg.tenant_id = t.id AND tg.status IN ('belum_bayar', 'cicilan')), 0) AS unpaid_amount,
        EXISTS(
          SELECT 1 FROM tagihan tg
          WHERE tg.tenant_id = t.id
          AND tg.status IN ('belum_bayar', 'cicilan')
          AND tg.tanggal_jatuh_tempo < NOW() - INTERVAL '30 days'
        ) AS has_overdue_invoices
      FROM tenant t
      ORDER BY t.nama
    `);

    const tenants: TenantSummary[] = (tenantsResult.rows as Record<string, unknown>[]).map(
      (row) => ({
        id: row.id as string,
        nama: row.nama as string,
        isActive: row.is_active as boolean,
        userCount: Number(row.user_count),
        studentCount: Number(row.student_count),
        unpaidAmount: Number(row.unpaid_amount),
        hasOverdueInvoices: row.has_overdue_invoices as boolean,
      }),
    );

    return {
      overview: {
        totalTenants: Number(overview.total_tenants),
        activeTenants: Number(overview.active_tenants),
        inactiveTenants: Number(overview.inactive_tenants),
        totalUsers: Number(overview.total_users),
        totalStudents: Number(overview.total_students),
        totalUnpaidInvoices: Number(overview.total_unpaid_invoices),
      },
      tenants,
    };
  }
}

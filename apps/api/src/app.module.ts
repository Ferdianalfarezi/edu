import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validate } from './config/env.validation';
import { StorageModule } from './modules/storage';
import { RedisModule } from './modules/redis';
import { QueueModule } from './modules/queue';
import { DrizzleModule } from './drizzle/drizzle.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { MataPelajaranModule } from './modules/mata-pelajaran/mata-pelajaran.module';
import { KonfigurasiModule } from './modules/konfigurasi/konfigurasi.module';
import { UserModule } from './modules/user/user.module';
import { KelasModule } from './modules/kelas/kelas.module';
import { TahunAjaranModule } from './modules/tahun-ajaran/tahun-ajaran.module';
import { SiswaModule } from './modules/siswa/siswa.module';
import { JadwalModule } from './modules/jadwal/jadwal.module';
import { AbsensiModule } from './modules/absensi/absensi.module';
import { NotifikasiModule } from './modules/notifikasi/notifikasi.module';
import { PengumumanModule } from './modules/pengumuman/pengumuman.module';
import { TagihanModule } from './modules/tagihan/tagihan.module';
import { RaporModule } from './modules/rapor/rapor.module';
import { RppModule } from './modules/rpp/rpp.module';
import { KenaikanKelasModule } from './modules/kenaikan-kelas/kenaikan-kelas.module';
import { AuditLogModule } from './modules/audit-log';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { AppVersionInterceptor } from './common/interceptors/app-version.interceptor';
import { LoggingInterceptor } from './common/monitoring/logging.interceptor';
import { ErrorTrackingFilter } from './common/monitoring/error-tracking.filter';
import { CorrelationIdMiddleware } from './common/monitoring/correlation-id.middleware';
import { MonitoringModule } from './common/monitoring/monitoring.module';
import { MONITORING_CONFIG } from './common/monitoring/monitoring.config';

@Module({
  imports: [
    // Configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env'],
    }),

    // Structured JSON logging (pino)
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProduction
              ? MONITORING_CONFIG.logging.productionLevel
              : MONITORING_CONFIG.logging.developmentLevel,
            transport: isProduction
              ? undefined
              : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
            redact: MONITORING_CONFIG.logging.redactPaths as unknown as string[],
            serializers: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              req: (req: any) => ({
                id: req.id,
                method: req.method,
                url: req.url,
                remoteAddress: req.remoteAddress,
              }),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              res: (res: any) => ({
                statusCode: res.statusCode,
              }),
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            genReqId: (req: any) => req.headers['x-request-id'] || req['requestId'] || undefined,
          },
        };
      },
    }),

    // Database (Drizzle ORM + pg Pool)
    DrizzleModule,

    // Redis (global — cache, token blacklist, locks)
    RedisModule,

    // Bull queues (global — background job processing)
    QueueModule,

    // Rate limiting (per ADR-005)
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 60, // 60 requests per minute default
      },
    ]),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // S3-compatible storage (Cloudflare R2)
    StorageModule,

    // Health checks (DB, Redis, R2)
    HealthModule,

    // Queue depth monitoring and alerting
    MonitoringModule,

    // Authentication (JWT, login, refresh)
    AuthModule,

    // Tenant management (Super Admin)
    TenantModule,

    // School configuration (konfigurasi + hari libur)
    KonfigurasiModule,

    // Mata Pelajaran (subject management)
    MataPelajaranModule,

    // User management (CRUD, bulk import)
    UserModule,

    // Kelas management (class CRUD, wali_kelas, duplication)
    KelasModule,

    // Tahun Ajaran (academic year lifecycle)
    TahunAjaranModule,

    // Siswa management (student CRUD, parent linkage, bulk import)
    SiswaModule,

    // Jadwal Pelajaran (schedule management)
    JadwalModule,

    // Absensi (attendance management)
    AbsensiModule,

    // Notifikasi (push notifications, device tokens)
    NotifikasiModule,

    // Pengumuman (announcements broadcast/targeted)
    PengumumanModule,

    // Tagihan (billing generation, payments)
    TagihanModule,

    // Rapor (grades, assessment components)
    RaporModule,

    // RPP / Modul Ajar (lesson plan management)
    RppModule,

    // Kenaikan Kelas (class promotion)
    KenaikanKelasModule,

    // Audit Log (global — cross-tenant audit trail)
    AuditLogModule,

    // Dashboard (Superadmin cross-tenant metrics)
    DashboardModule,
  ],
  controllers: [],
  providers: [
    // Global error tracking filter (structured error responses + logging)
    {
      provide: APP_FILTER,
      useClass: ErrorTrackingFilter,
    },
    // Global interceptor: structured request/response logging with timing
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Global interceptor: sets PostgreSQL session variables for RLS (ADR-001)
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    // Global interceptor: sets X-Minimum-App-Version header (ADR-004)
    {
      provide: APP_INTERCEPTOR,
      useClass: AppVersionInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

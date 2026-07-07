/**
 * Production monitoring configuration.
 * Alerting thresholds per ADR-006: Load Estimation and Scaling Strategy.
 */
export const MONITORING_CONFIG = {
  /**
   * Alerting thresholds that trigger scaling actions or investigation.
   */
  alerts: {
    /** API response p95 latency in milliseconds. Trigger: add API replica. */
    apiP95LatencyMs: 500,
    /** Bull queue depth. Trigger: add worker replica or increase concurrency. */
    queueDepthMax: 500,
    /** Notification delivery p95 latency in seconds. Trigger: investigate + increase worker concurrency. */
    notificationP95LatencySeconds: 25,
    /** API error rate percentage. Trigger: alert + investigate. */
    errorRatePercent: 1,
    /** Sustained duration in minutes before alert fires. */
    sustainedMinutes: 5,
    /** Queue depth sustained duration in minutes. */
    queueSustainedMinutes: 2,
  },

  /**
   * Health check configuration.
   */
  healthCheck: {
    /** Timeout for database health check in milliseconds. */
    dbTimeoutMs: 3000,
    /** Timeout for Redis health check in milliseconds. */
    redisTimeoutMs: 2000,
    /** Timeout for R2/S3 health check in milliseconds. */
    storageTimeoutMs: 5000,
  },

  /**
   * Logging configuration.
   */
  logging: {
    /** Minimum log level in production. */
    productionLevel: 'info' as const,
    /** Minimum log level in development. */
    developmentLevel: 'debug' as const,
    /** Whether to redact sensitive fields from logs. */
    redactSensitiveFields: true,
    /** Fields to redact from request/response logs. */
    redactPaths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.old_password',
      'req.body.new_password',
      'req.body.refresh_token',
    ],
  },

  /**
   * Request tracking configuration.
   */
  requestTracking: {
    /** Header name for correlation/request ID. */
    headerName: 'X-Request-ID',
    /** Whether to generate a request ID if not provided by client. */
    autoGenerate: true,
  },

  /**
   * Queue monitoring configuration.
   */
  queueMonitoring: {
    /** Queues to monitor for depth alerts. */
    monitoredQueues: ['notification', 'image', 'import', 'export', 'email', 'cron'],
    /** Polling interval in milliseconds for queue depth checks. */
    pollingIntervalMs: 30_000,
  },
} as const;

export type MonitoringConfig = typeof MONITORING_CONFIG;

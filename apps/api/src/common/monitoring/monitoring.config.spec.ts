import { MONITORING_CONFIG } from './monitoring.config';

describe('MonitoringConfig', () => {
  describe('alerting thresholds per ADR-006', () => {
    it('should have API p95 latency threshold at 500ms', () => {
      expect(MONITORING_CONFIG.alerts.apiP95LatencyMs).toBe(500);
    });

    it('should have queue depth threshold at 500', () => {
      expect(MONITORING_CONFIG.alerts.queueDepthMax).toBe(500);
    });

    it('should have notification p95 latency threshold at 25 seconds', () => {
      expect(MONITORING_CONFIG.alerts.notificationP95LatencySeconds).toBe(25);
    });

    it('should have error rate threshold at 1%', () => {
      expect(MONITORING_CONFIG.alerts.errorRatePercent).toBe(1);
    });

    it('should have sustained duration of 5 minutes for API alerts', () => {
      expect(MONITORING_CONFIG.alerts.sustainedMinutes).toBe(5);
    });

    it('should have sustained duration of 2 minutes for queue alerts', () => {
      expect(MONITORING_CONFIG.alerts.queueSustainedMinutes).toBe(2);
    });
  });

  describe('logging configuration', () => {
    it('should use info level in production', () => {
      expect(MONITORING_CONFIG.logging.productionLevel).toBe('info');
    });

    it('should use debug level in development', () => {
      expect(MONITORING_CONFIG.logging.developmentLevel).toBe('debug');
    });

    it('should redact sensitive request fields', () => {
      expect(MONITORING_CONFIG.logging.redactPaths).toContain('req.headers.authorization');
      expect(MONITORING_CONFIG.logging.redactPaths).toContain('req.body.password');
      expect(MONITORING_CONFIG.logging.redactPaths).toContain('req.body.refresh_token');
    });
  });

  describe('request tracking', () => {
    it('should use X-Request-ID header', () => {
      expect(MONITORING_CONFIG.requestTracking.headerName).toBe('X-Request-ID');
    });

    it('should auto-generate request IDs', () => {
      expect(MONITORING_CONFIG.requestTracking.autoGenerate).toBe(true);
    });
  });

  describe('queue monitoring', () => {
    it('should monitor all defined queues', () => {
      expect(MONITORING_CONFIG.queueMonitoring.monitoredQueues).toContain('notification');
      expect(MONITORING_CONFIG.queueMonitoring.monitoredQueues).toContain('image');
      expect(MONITORING_CONFIG.queueMonitoring.monitoredQueues).toContain('import');
      expect(MONITORING_CONFIG.queueMonitoring.monitoredQueues).toContain('export');
      expect(MONITORING_CONFIG.queueMonitoring.monitoredQueues).toContain('email');
      expect(MONITORING_CONFIG.queueMonitoring.monitoredQueues).toContain('cron');
    });

    it('should poll every 30 seconds', () => {
      expect(MONITORING_CONFIG.queueMonitoring.pollingIntervalMs).toBe(30_000);
    });
  });
});

import { BaseProcessor } from './base.processor';
import { Job } from 'bull';

// Concrete implementation for testing
class TestProcessor extends BaseProcessor {
  public deadLetterJobs: { job: Job; error: Error }[] = [];

  constructor(concurrency = 5, maxAttempts = 3) {
    super('TestProcessor', { concurrency, maxAttempts });
  }

  protected async handleDeadLetter(job: Job, error: Error): Promise<void> {
    this.deadLetterJobs.push({ job, error });
  }
}

function createMockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    name: 'test-job',
    attemptsMade: 0,
    processedOn: Date.now() - 100,
    data: { tenant_id: 'tenant-1', payload: 'test' },
    ...overrides,
  } as unknown as Job;
}

describe('BaseProcessor', () => {
  let processor: TestProcessor;

  beforeEach(() => {
    processor = new TestProcessor(10, 3);
  });

  describe('constructor', () => {
    it('sets default options when none provided', () => {
      const p = new TestProcessor();
      expect(p['options'].concurrency).toBe(5);
      expect(p['options'].maxAttempts).toBe(3);
    });

    it('uses provided options', () => {
      expect(processor['options'].concurrency).toBe(10);
      expect(processor['options'].maxAttempts).toBe(3);
    });

    it('creates a logger with the processor name', () => {
      expect(processor['logger']).toBeDefined();
    });
  });

  describe('onActive', () => {
    it('logs job start with attempt info', () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');
      const job = createMockJob({ attemptsMade: 1 });

      processor.onActive(job);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 2/3'));
    });
  });

  describe('onCompleted', () => {
    it('logs job completion with duration', () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');
      const job = createMockJob({ processedOn: Date.now() - 250 });

      processor.onCompleted(job);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Completed job'));
    });
  });

  describe('onFailed', () => {
    it('logs warning for retryable failures', () => {
      const warnSpy = jest.spyOn(processor['logger'], 'warn');
      const job = createMockJob({ attemptsMade: 1 });
      const error = new Error('Temporary failure');

      processor.onFailed(job, error);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Will retry'));
      expect(processor.deadLetterJobs).toHaveLength(0);
    });

    it('triggers dead letter when max attempts reached', async () => {
      const errorSpy = jest.spyOn(processor['logger'], 'error');
      const job = createMockJob({ attemptsMade: 3 });
      const error = new Error('Permanent failure');

      processor.onFailed(job, error);

      // Wait for the async handleDeadLetter to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEAD LETTER'),
        expect.any(String),
      );
      expect(processor.deadLetterJobs).toHaveLength(1);
      expect(processor.deadLetterJobs[0].error.message).toBe('Permanent failure');
    });

    it('does not trigger dead letter when attempts < maxAttempts', () => {
      const job = createMockJob({ attemptsMade: 2 });
      const error = new Error('Will retry');

      processor.onFailed(job, error);

      expect(processor.deadLetterJobs).toHaveLength(0);
    });
  });

  describe('onStalled', () => {
    it('logs stalled job warning', () => {
      const warnSpy = jest.spyOn(processor['logger'], 'warn');
      const job = createMockJob();

      processor.onStalled(job);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Stalled'));
    });
  });
});

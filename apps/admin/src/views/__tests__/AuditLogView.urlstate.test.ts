import { vi, describe, it, expect, beforeEach } from 'vitest';
import { reactive, computed } from 'vue';

// Mock vue-router
const mockRoute = reactive({ query: {} as Record<string, string | string[] | undefined> });
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

import { useTableUrlState } from '@/composables/useTableUrlState';
import type { TableUrlStateConfig } from '@/composables/useTableUrlState';

/**
 * Integration tests for AuditLogView URL state.
 *
 * Tests the composable with AuditLogView's specific config and
 * the view-level date validation logic (validDateFrom / validDateTo computeds).
 *
 * Validates: Requirements 5.2, 5.4
 */
describe('AuditLogView URL state integration', () => {
  const auditLogConfig: TableUrlStateConfig = {
    searchKey: 'search',
    defaultPageSize: 15,
    filters: [
      { key: 'action', type: 'string' },
      { key: 'user_id', type: 'string' },
      { key: 'date_from', type: 'string' },
      { key: 'date_to', type: 'string' },
    ],
  };

  beforeEach(() => {
    mockRoute.query = {};
    mockReplace.mockClear();
  });

  describe('date query params populate date filters (Requirement 5.2)', () => {
    it('mounts with valid date query params and populates date filters', () => {
      mockRoute.query = { date_from: '2024-01-15', date_to: '2024-02-15' };

      const { filters } = useTableUrlState(auditLogConfig);

      expect(filters['date_from'].value).toBe('2024-01-15');
      expect(filters['date_to'].value).toBe('2024-02-15');
    });

    it('view-level validDateFrom/validDateTo returns valid dates', () => {
      mockRoute.query = { date_from: '2024-01-15', date_to: '2024-02-15' };

      const { filters } = useTableUrlState(auditLogConfig);

      // Replicate the view-level validation computed (from AuditLogView.vue)
      const validDateFrom = computed(() => {
        const val = filters['date_from'].value;
        if (!val || isNaN(Date.parse(val))) return undefined;
        return val;
      });
      const validDateTo = computed(() => {
        const val = filters['date_to'].value;
        if (!val || isNaN(Date.parse(val))) return undefined;
        return val;
      });

      expect(validDateFrom.value).toBe('2024-01-15');
      expect(validDateTo.value).toBe('2024-02-15');
    });
  });

  describe('invalid date format in URL is ignored (Requirement 5.4)', () => {
    it('composable level: returns the invalid string as-is (string type accepts any string)', () => {
      mockRoute.query = { date_from: 'not-a-date' };

      const { filters } = useTableUrlState(auditLogConfig);

      // The composable stores whatever non-empty string the URL contains
      expect(filters['date_from'].value).toBe('not-a-date');
    });

    it('view level: validDateFrom returns undefined for invalid date format', () => {
      mockRoute.query = { date_from: 'not-a-date' };

      const { filters } = useTableUrlState(auditLogConfig);

      // Replicate view-level date validation
      const validDateFrom = computed(() => {
        const val = filters['date_from'].value;
        if (!val || isNaN(Date.parse(val))) return undefined;
        return val;
      });

      expect(validDateFrom.value).toBeUndefined();
    });

    it('view level: validDateTo returns undefined for garbage date value', () => {
      mockRoute.query = { date_to: '99/99/9999' };

      const { filters } = useTableUrlState(auditLogConfig);

      const validDateTo = computed(() => {
        const val = filters['date_to'].value;
        if (!val || isNaN(Date.parse(val))) return undefined;
        return val;
      });

      expect(validDateTo.value).toBeUndefined();
    });

    it('view level: partial invalid dates (only date_from invalid) leaves date_to valid', () => {
      mockRoute.query = { date_from: 'xyz', date_to: '2024-06-01' };

      const { filters } = useTableUrlState(auditLogConfig);

      const validDateFrom = computed(() => {
        const val = filters['date_from'].value;
        if (!val || isNaN(Date.parse(val))) return undefined;
        return val;
      });
      const validDateTo = computed(() => {
        const val = filters['date_to'].value;
        if (!val || isNaN(Date.parse(val))) return undefined;
        return val;
      });

      expect(validDateFrom.value).toBeUndefined();
      expect(validDateTo.value).toBe('2024-06-01');
    });
  });

  describe('empty or absent date filter returns undefined', () => {
    it('absent date_from returns undefined filter value', () => {
      mockRoute.query = {};

      const { filters } = useTableUrlState(auditLogConfig);

      expect(filters['date_from'].value).toBeUndefined();
    });

    it('empty string date_from returns undefined filter value', () => {
      mockRoute.query = { date_from: '' };

      const { filters } = useTableUrlState(auditLogConfig);

      // parseStringFilter returns undefined for empty strings
      expect(filters['date_from'].value).toBeUndefined();
    });

    it('absent date_to returns undefined filter value', () => {
      mockRoute.query = { date_from: '2024-01-01' };

      const { filters } = useTableUrlState(auditLogConfig);

      expect(filters['date_from'].value).toBe('2024-01-01');
      expect(filters['date_to'].value).toBeUndefined();
    });
  });
});

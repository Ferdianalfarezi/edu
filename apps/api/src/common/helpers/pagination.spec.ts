import { paginate, DEFAULT_PAGE_SIZE } from './pagination';

describe('paginate', () => {
  // Helper to generate rows with sequential UUIDs
  function makeRows(count: number): { id: string; name: string }[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      name: `Item ${i}`,
    }));
  }

  it('should return has_next=false and cursor=null when rows <= limit', () => {
    const rows = makeRows(5);
    const result = paginate(rows, 10);

    expect(result.data).toHaveLength(5);
    expect(result.meta.has_next).toBe(false);
    expect(result.meta.cursor).toBeNull();
  });

  it('should return has_next=true and cursor=last id when rows > limit', () => {
    // Simulate fetch of limit+1 rows (e.g., 21 rows for limit=20)
    const rows = makeRows(21);
    const result = paginate(rows, 20);

    expect(result.data).toHaveLength(20);
    expect(result.meta.has_next).toBe(true);
    expect(result.meta.cursor).toBe(rows[19].id);
  });

  it('should return empty data with has_next=false for empty input', () => {
    const result = paginate([], 20);

    expect(result.data).toHaveLength(0);
    expect(result.meta.has_next).toBe(false);
    expect(result.meta.cursor).toBeNull();
  });

  it('should use DEFAULT_PAGE_SIZE when limit is not specified', () => {
    const rows = makeRows(DEFAULT_PAGE_SIZE + 1);
    const result = paginate(rows);

    expect(result.data).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(result.meta.has_next).toBe(true);
    expect(result.meta.cursor).toBe(rows[DEFAULT_PAGE_SIZE - 1].id);
  });

  it('should handle exactly limit rows (no next page)', () => {
    const rows = makeRows(20);
    const result = paginate(rows, 20);

    expect(result.data).toHaveLength(20);
    expect(result.meta.has_next).toBe(false);
    expect(result.meta.cursor).toBeNull();
  });

  it('should not mutate the original array', () => {
    const rows = makeRows(5);
    const original = [...rows];
    paginate(rows, 3);

    expect(rows).toEqual(original);
  });

  it('should handle limit of 1', () => {
    const rows = makeRows(2);
    const result = paginate(rows, 1);

    expect(result.data).toHaveLength(1);
    expect(result.meta.has_next).toBe(true);
    expect(result.meta.cursor).toBe(rows[0].id);
  });
});

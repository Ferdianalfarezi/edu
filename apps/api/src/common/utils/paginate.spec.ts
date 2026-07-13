import { paginate } from './paginate';

describe('paginate (offset-based)', () => {
  it('should return correct meta for a typical page', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const result = paginate(items, 50, 1, 20);

    expect(result.data).toEqual(items);
    expect(result.meta).toEqual({
      page: 1,
      page_size: 20,
      total_count: 50,
      total_pages: 3,
    });
  });

  it('should compute total_pages as ceil(total_count / page_size)', () => {
    const result = paginate([], 21, 2, 10);

    expect(result.meta.total_pages).toBe(3);
  });

  it('should return total_pages = 1 when total_count <= page_size', () => {
    const result = paginate([{ a: 1 }], 1, 1, 20);

    expect(result.meta.total_pages).toBe(1);
  });

  it('should return total_pages = 0 when total_count is 0', () => {
    const result = paginate([], 0, 1, 20);

    expect(result.meta.total_pages).toBe(0);
    expect(result.data).toEqual([]);
  });

  it('should pass through page and page_size as provided', () => {
    const result = paginate(['a', 'b', 'c'], 100, 5, 3);

    expect(result.meta.page).toBe(5);
    expect(result.meta.page_size).toBe(3);
  });

  it('should not mutate the input items array', () => {
    const items = [1, 2, 3];
    const original = [...items];
    paginate(items, 10, 1, 5);

    expect(items).toEqual(original);
  });
});

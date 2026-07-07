import { BadRequestException } from '@nestjs/common';
import { ParseCursorPipe } from './parse-cursor.pipe';

describe('ParseCursorPipe', () => {
  let pipe: ParseCursorPipe;

  beforeEach(() => {
    pipe = new ParseCursorPipe();
  });

  it('should return undefined for undefined input', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('should return undefined for null input', () => {
    expect(pipe.transform(null as any)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(pipe.transform('')).toBeUndefined();
  });

  it('should pass through a valid UUID v4', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(pipe.transform(uuid)).toBe(uuid);
  });

  it('should pass through a valid UUID with uppercase letters', () => {
    const uuid = '550E8400-E29B-41D4-A716-446655440000';
    expect(pipe.transform(uuid)).toBe(uuid);
  });

  it('should throw BadRequestException for invalid cursor format', () => {
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);
    expect(() => pipe.transform('not-a-uuid')).toThrow(
      'Cursor harus berupa UUID yang valid atau tidak diisi',
    );
  });

  it('should throw BadRequestException for partial UUID', () => {
    expect(() => pipe.transform('550e8400-e29b-41d4-a716')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for UUID without hyphens', () => {
    expect(() => pipe.transform('550e8400e29b41d4a716446655440000')).toThrow(BadRequestException);
  });
});

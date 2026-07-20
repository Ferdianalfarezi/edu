import { describe, it, expect } from 'vitest';
import { parsePage, parsePageSize, parseStringFilter, parseEnumFilter } from './urlStateParsers';

describe('parsePage', () => {
  it('returns 1 for undefined', () => {
    expect(parsePage(undefined)).toBe(1);
  });

  it('returns 1 for empty string', () => {
    expect(parsePage('')).toBe(1);
  });

  it('returns 1 for non-numeric string', () => {
    expect(parsePage('abc')).toBe(1);
  });

  it('returns 1 for zero', () => {
    expect(parsePage('0')).toBe(1);
  });

  it('returns 1 for negative number', () => {
    expect(parsePage('-3')).toBe(1);
  });

  it('returns parsed value for valid positive integer', () => {
    expect(parsePage('5')).toBe(5);
  });

  it('returns parsed value for "1"', () => {
    expect(parsePage('1')).toBe(1);
  });

  it('uses first element when value is an array', () => {
    expect(parsePage(['3', '7'])).toBe(3);
  });

  it('returns 1 when array first element is invalid', () => {
    expect(parsePage(['abc', '5'])).toBe(1);
  });

  it('returns 1 for Infinity string', () => {
    expect(parsePage('Infinity')).toBe(1);
  });

  it('truncates decimal values (parseInt behavior)', () => {
    expect(parsePage('3.7')).toBe(3);
  });
});

describe('parsePageSize', () => {
  const defaultSize = 15;

  it('returns default for undefined', () => {
    expect(parsePageSize(undefined, defaultSize)).toBe(15);
  });

  it('returns default for non-numeric string', () => {
    expect(parsePageSize('abc', defaultSize)).toBe(15);
  });

  it('returns default for value not in allowed set', () => {
    expect(parsePageSize('20', defaultSize)).toBe(15);
    expect(parsePageSize('100', defaultSize)).toBe(15);
  });

  it('returns parsed value for allowed page sizes', () => {
    expect(parsePageSize('10', defaultSize)).toBe(10);
    expect(parsePageSize('15', defaultSize)).toBe(15);
    expect(parsePageSize('25', defaultSize)).toBe(25);
    expect(parsePageSize('50', defaultSize)).toBe(50);
  });

  it('uses first element when value is an array', () => {
    expect(parsePageSize(['25', '50'], defaultSize)).toBe(25);
  });

  it('returns default when array first element is invalid', () => {
    expect(parsePageSize(['99', '25'], defaultSize)).toBe(15);
  });

  it('respects custom default size', () => {
    expect(parsePageSize(undefined, 25)).toBe(25);
    expect(parsePageSize('invalid', 10)).toBe(10);
  });
});

describe('parseStringFilter', () => {
  it('returns undefined for undefined', () => {
    expect(parseStringFilter(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseStringFilter('')).toBeUndefined();
  });

  it('returns the string for a non-empty value', () => {
    expect(parseStringFilter('hello')).toBe('hello');
  });

  it('uses first element when value is an array', () => {
    expect(parseStringFilter(['first', 'second'])).toBe('first');
  });

  it('returns undefined when array first element is empty', () => {
    expect(parseStringFilter(['', 'second'])).toBeUndefined();
  });

  it('preserves special characters', () => {
    expect(parseStringFilter('hello world')).toBe('hello world');
    expect(parseStringFilter('a&b=c')).toBe('a&b=c');
  });
});

describe('parseEnumFilter', () => {
  const enumValues = ['aktif', 'pindah_sekolah', 'keluar', 'lulus'];

  it('returns undefined for undefined', () => {
    expect(parseEnumFilter(undefined, enumValues)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseEnumFilter('', enumValues)).toBeUndefined();
  });

  it('returns undefined for value not in enum set', () => {
    expect(parseEnumFilter('invalid', enumValues)).toBeUndefined();
  });

  it('returns the value when it matches an enum value', () => {
    expect(parseEnumFilter('aktif', enumValues)).toBe('aktif');
    expect(parseEnumFilter('lulus', enumValues)).toBe('lulus');
  });

  it('uses first element when value is an array', () => {
    expect(parseEnumFilter(['keluar', 'aktif'], enumValues)).toBe('keluar');
  });

  it('returns undefined when array first element is not in enum', () => {
    expect(parseEnumFilter(['invalid', 'aktif'], enumValues)).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(parseEnumFilter('AKTIF', enumValues)).toBeUndefined();
    expect(parseEnumFilter('Aktif', enumValues)).toBeUndefined();
  });
});

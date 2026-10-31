// Pure unit tests for lib/listings.js (pagination, filters, image URLs). No database.
const {
  parsePagination, buildListFilter, parseInlineImage, toListItem, pageMeta, DEFAULT_LIMIT, MAX_LIMIT,
} = require('../lib/listings');

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('parsePagination', () => {
  test('defaults to page 1 and the default page size', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: DEFAULT_LIMIT, skip: 0 });
  });
  test('computes skip from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
  });
  test('clamps nonsense: negative, zero, huge and non-numeric values', () => {
    expect(parsePagination({ page: '-4', limit: '0' })).toEqual({ page: 1, limit: 1, skip: 0 });
    expect(parsePagination({ limit: '100000' }).limit).toBe(MAX_LIMIT);
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: DEFAULT_LIMIT, skip: 0 });
  });
});

describe('buildListFilter', () => {
  test('empty query means no filter', () => {
    expect(buildListFilter({})).toEqual({});
  });
  test('accepts only known categories and statuses', () => {
    expect(buildListFilter({ category: 'Fruits', status: 'open' })).toEqual({ category: 'Fruits', status: 'open' });
    expect(buildListFilter({ category: 'Weapons', status: 'hacked' })).toEqual({});
  });
  test('farmerId must look like an ObjectId', () => {
    expect(buildListFilter({ farmerId: '507f1f77bcf86cd799439011' })).toEqual({ farmerId: '507f1f77bcf86cd799439011' });
    expect(buildListFilter({ farmerId: 'abc' })).toEqual({});
  });
  test('operator injection through the query string is ignored', () => {
    // ?status[$ne]=x arrives as an object, not a string
    expect(buildListFilter({ status: { $ne: 'x' }, category: { $gt: '' }, q: { $regex: '.*' } })).toEqual({});
  });
  test('search text becomes an escaped, case-insensitive match on name, variety and location', () => {
    const filter = buildListFilter({ q: ' to.ma(to ' });
    expect(filter.$or).toHaveLength(3);
    const rx = filter.$or[0].cropName;
    expect(rx.test('TO.MA(TO plant')).toBe(true);
    expect(rx.test('tomato')).toBe(false); // the dot and bracket are literal, not regex syntax
  });
});

describe('inline images', () => {
  test('parseInlineImage splits a data URI and rejects everything else', () => {
    const parsed = parseInlineImage(TINY_PNG);
    expect(parsed.mime).toBe('image/png');
    expect(parsed.buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(parseInlineImage('https://example.com/a.jpg')).toBeNull();
    expect(parseInlineImage('data:image/svg+xml;base64,AAAA')).toBeNull();
    expect(parseInlineImage(null)).toBeNull();
  });
  test('a list item swaps the heavy data URI for a small cacheable URL', () => {
    const item = toListItem({ _id: 'abc123', cropName: 'Rice', imageUrl: TINY_PNG, updatedAt: '2026-01-01T00:00:00.000Z' }, 'https://api.example.com');
    expect(item.imageUrl).toBe(`https://api.example.com/api/crops/abc123/image?v=${new Date('2026-01-01T00:00:00.000Z').getTime()}`);
    expect(item.imageUrl.length).toBeLessThan(120);
  });
  test('external https photos and missing photos pass through unchanged', () => {
    expect(toListItem({ _id: '1', imageUrl: 'https://upload.wikimedia.org/x.jpg' }, 'http://h').imageUrl).toBe('https://upload.wikimedia.org/x.jpg');
    expect(toListItem({ _id: '1', imageUrl: null }, 'http://h').imageUrl).toBeNull();
  });
  test('toListItem does not mutate its input', () => {
    const crop = { _id: '1', imageUrl: TINY_PNG };
    toListItem(crop, 'http://h');
    expect(crop.imageUrl).toBe(TINY_PNG);
  });
});

describe('pageMeta', () => {
  test('reports totals and whether more pages exist', () => {
    expect(pageMeta({ page: 1, limit: 24, total: 50, returned: 24 })).toEqual({ page: 1, limit: 24, total: 50, totalPages: 3, hasMore: true });
    expect(pageMeta({ page: 3, limit: 24, total: 50, returned: 2 })).toEqual({ page: 3, limit: 24, total: 50, totalPages: 3, hasMore: false });
    expect(pageMeta({ page: 1, limit: 24, total: 0, returned: 0 })).toEqual({ page: 1, limit: 24, total: 0, totalPages: 1, hasMore: false });
  });
});

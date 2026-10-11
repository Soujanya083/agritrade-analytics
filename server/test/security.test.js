const {
  resolveJwtSecret, buildCorsOptions, parseCorsOrigins, generateOtp, safeEqual, shouldExposeOtp, isProduction,
  DEV_FALLBACK_JWT_SECRET,
} = require('../security');

describe('resolveJwtSecret', () => {
  test('uses JWT_SECRET when present', () => {
    expect(resolveJwtSecret({ JWT_SECRET: 'abc' })).toEqual({ secret: 'abc', usingFallback: false });
  });
  test('falls back to the dev secret locally and says so', () => {
    expect(resolveJwtSecret({})).toEqual({ secret: DEV_FALLBACK_JWT_SECRET, usingFallback: true });
  });
  test('refuses to start in production without a secret', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });
  test('treats Render as production even if NODE_ENV is unset', () => {
    expect(isProduction({ RENDER: 'true' })).toBe(true);
    expect(() => resolveJwtSecret({ RENDER: 'true' })).toThrow(/JWT_SECRET/);
  });
  test('dev fallback matches the analytics service default', () => {
    expect(DEV_FALLBACK_JWT_SECRET).toBe('dev-only-secret-do-not-use-in-production');
  });
});

describe('CORS', () => {
  const check = (options, origin) => new Promise((resolve) => {
    options.origin(origin, (err, allowed) => resolve(allowed));
  });
  test('unset => allow any origin (dev)', () => {
    expect(buildCorsOptions({})).toEqual({ origin: true });
  });
  test('parses and trims a comma separated list', () => {
    expect(parseCorsOrigins({ CORS_ORIGINS: ' https://a.app/ , https://b.app ' })).toEqual(['https://a.app', 'https://b.app']);
  });
  test('allows listed origins and rejects others', async () => {
    const options = buildCorsOptions({ CORS_ORIGINS: 'https://a.app' });
    expect(await check(options, 'https://a.app')).toBe(true);
    expect(await check(options, 'https://evil.example')).toBe(false);
  });
  test('allows requests with no Origin header (curl / server-to-server)', async () => {
    expect(await check(buildCorsOptions({ CORS_ORIGINS: 'https://a.app' }), undefined)).toBe(true);
  });
});

describe('OTP helpers', () => {
  test('generateOtp always returns 6 digits', () => {
    for (let i = 0; i < 500; i += 1) expect(generateOtp()).toMatch(/^[0-9]{6}$/);
  });
  test('generateOtp is not constant', () => {
    expect(new Set(Array.from({ length: 50 }, generateOtp)).size).toBeGreaterThan(40);
  });
  test('safeEqual compares correctly', () => {
    expect(safeEqual('123456', '123456')).toBe(true);
    expect(safeEqual('123456', '123457')).toBe(false);
    expect(safeEqual('123456', '12345')).toBe(false);
    expect(safeEqual(null, '123456')).toBe(false);
  });
  test('OTP exposure is on by default (demo mode) and can be disabled', () => {
    expect(shouldExposeOtp({})).toBe(true);
    expect(shouldExposeOtp({ EXPOSE_OTP_IN_RESPONSE: 'false' })).toBe(false);
  });
});

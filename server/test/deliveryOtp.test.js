const {
  otpConfig, generateCode, hashCode, codesMatch, isWellFormed, canIssue, precheck, afterWrongAttempt,
} = require('../lib/deliveryOtp');

const cfg = otpConfig({});
const NOW = new Date('2026-10-30T10:00:00Z');
const plus = (ms) => new Date(NOW.getTime() + ms);

describe('code generation', () => {
  test('always six digits, including leading zeros', () => {
    for (let i = 0; i < 2000; i += 1) expect(generateCode()).toMatch(/^[0-9]{6}$/);
  });
  test('codes are not constant', () => {
    expect(new Set(Array.from({ length: 200 }, generateCode)).size).toBeGreaterThan(150);
  });
  test('well-formed check', () => {
    expect(isWellFormed('012345')).toBe(true);
    for (const bad of ['12345', '1234567', 'abcdef', '12 345', '', null, undefined, { $ne: 1 }]) expect(isWellFormed(bad)).toBe(false);
  });
});

describe('hashing', () => {
  test('the code is never stored in clear text', () => {
    const h = hashCode('123456', 'SHP-1', 'secret');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h.includes('123456')).toBe(false);
  });
  test('the right code matches, a wrong one does not', () => {
    const h = hashCode('123456', 'SHP-1', 'secret');
    expect(codesMatch('123456', 'SHP-1', 'secret', h)).toBe(true);
    expect(codesMatch('123457', 'SHP-1', 'secret', h)).toBe(false);
  });
  test('a code for one shipment is useless on another (no replay across shipments)', () => {
    const h = hashCode('123456', 'SHP-1', 'secret');
    expect(codesMatch('123456', 'SHP-2', 'secret', h)).toBe(false);
  });
  test('a different server secret gives a different hash', () => {
    expect(hashCode('123456', 'SHP-1', 'a')).not.toBe(hashCode('123456', 'SHP-1', 'b'));
  });
  test('no stored hash, or a damaged one, never matches', () => {
    expect(codesMatch('123456', 'SHP-1', 'secret', null)).toBe(false);
    expect(codesMatch('123456', 'SHP-1', 'secret', 'zz')).toBe(false);
  });
  test('refuses to hash without a secret', () => {
    expect(() => hashCode('123456', 'SHP-1', '')).toThrow();
  });
});

describe('issuing', () => {
  test('first code: allowed', () => {
    expect(canIssue({}, NOW, cfg).ok).toBe(true);
  });
  test('asking again straight away is refused with a wait time', () => {
    const r = canIssue({ lastIssuedAt: plus(-20000), issueCount: 1 }, NOW, cfg);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('otp_cooldown');
    expect(r.retryAfterSeconds).toBe(40);
  });
  test('after the cooldown another code is allowed', () => {
    expect(canIssue({ lastIssuedAt: plus(-61000), issueCount: 1 }, NOW, cfg).ok).toBe(true);
  });
  test('a cap on how many codes can be sent', () => {
    const r = canIssue({ lastIssuedAt: plus(-3600000), issueCount: 5 }, NOW, cfg);
    expect(r.code).toBe('otp_issue_limit');
  });
  test('while locked no new code is issued', () => {
    const r = canIssue({ lockedUntil: plus(300000) }, NOW, cfg);
    expect(r.code).toBe('otp_locked');
    expect(r.retryAfterSeconds).toBe(300);
  });
});

describe('checking a guess', () => {
  test('no code issued', () => {
    expect(precheck({ otpHash: null }, NOW).code).toBe('otp_not_issued');
  });
  test('expired code', () => {
    expect(precheck({ otpHash: 'x', otpExpiresAt: plus(-1) }, NOW).code).toBe('otp_expired');
    expect(precheck({ otpHash: 'x', otpExpiresAt: NOW }, NOW).code).toBe('otp_expired');
  });
  test('valid code window', () => {
    expect(precheck({ otpHash: 'x', otpExpiresAt: plus(1000) }, NOW).ok).toBe(true);
  });
  test('locked beats everything', () => {
    const r = precheck({ otpHash: 'x', otpExpiresAt: plus(1000), lockedUntil: plus(60000) }, NOW);
    expect(r.code).toBe('otp_locked');
  });
  test('the lock ends by itself', () => {
    expect(precheck({ otpHash: 'x', otpExpiresAt: plus(1000), lockedUntil: plus(-1) }, NOW).ok).toBe(true);
  });
});

describe('brute force protection', () => {
  test('wrong guesses are counted down', () => {
    expect(afterWrongAttempt(1, NOW, cfg)).toEqual({ locked: false, lockedUntil: null, attemptsRemaining: 4 });
    expect(afterWrongAttempt(4, NOW, cfg).attemptsRemaining).toBe(1);
  });
  test('the fifth wrong guess locks confirmation for 15 minutes', () => {
    const r = afterWrongAttempt(5, NOW, cfg);
    expect(r.locked).toBe(true);
    expect(r.lockedUntil.getTime()).toBe(NOW.getTime() + 15 * 60000);
  });
  test('an attacker can try at most 5 of the 1,000,000 codes per lock period', () => {
    expect(cfg.maxAttempts / 1000000).toBeLessThan(0.00001);
  });
  test('limits are configurable', () => {
    const c = otpConfig({ DELIVERY_OTP_MAX_ATTEMPTS: '3', DELIVERY_OTP_TTL_MINUTES: '10' });
    expect(afterWrongAttempt(3, NOW, c).locked).toBe(true);
    expect(c.ttlMinutes).toBe(10);
  });
});

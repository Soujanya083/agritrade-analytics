const { createCropImageResolver, buildSearchPlan, scorePhoto, matchTerms } = require('../services/cropImages');

const photo = (alt, extra = {}) => ({
  alt, photographer: 'Jane Doe', url: 'https://www.pexels.com/photo/1/', width: 1600, height: 1000,
  src: { medium: `https://images.pexels.com/${encodeURIComponent(alt)}.jpg` }, ...extra,
});
const okResponse = (photos) => ({ ok: true, status: 200, json: async () => ({ photos }) });
const silent = { warn: () => {} };

describe('buildSearchPlan', () => {
  test('fruits are searched as fruit, not "vegetable farm" (the original bug)', () => {
    const plan = buildSearchPlan('Orange', 'Fruits');
    expect(plan[0]).toBe('orange fruit');
    expect(plan.join(' ')).not.toMatch(/vegetable|farm/);
  });
  test('vegetables and grains get their own terms', () => {
    expect(buildSearchPlan('Carrot', 'Vegetables')[0]).toBe('carrot vegetable');
    expect(buildSearchPlan('Wheat', 'Grains')[0]).toBe('wheat grain');
  });
  test('local names are translated to searchable English', () => {
    expect(buildSearchPlan('Brinjal', 'Vegetables')[0]).toBe('eggplant vegetable');
    expect(buildSearchPlan('Jowar', 'Grains')[0]).toBe('sorghum grain');
  });
  test('unknown category still produces sensible queries', () => {
    expect(buildSearchPlan('Dragon Fruit', undefined)[0]).toBe('fresh dragon fruit');
  });
});

describe('scorePhoto', () => {
  test('accepts a photo whose alt names the crop', () => {
    expect(scorePhoto(photo('Close-up of fresh oranges on a tree'), 'Orange', 'Fruits')).toBeGreaterThan(3);
  });
  test('rejects photos that do not mention the crop', () => {
    expect(scorePhoto(photo('A farmer standing in a field'), 'Orange', 'Fruits')).toBe(-Infinity);
  });
  test('rejects photos with no alt text (cannot be verified)', () => {
    expect(scorePhoto(photo(''), 'Orange', 'Fruits')).toBe(-Infinity);
  });
  test('rejects illustrations / cartoons / backgrounds', () => {
    expect(scorePhoto(photo('Orange cartoon illustration'), 'Orange', 'Fruits')).toBe(-Infinity);
    expect(scorePhoto(photo('Orange background'), 'Orange', 'Fruits')).toBe(-Infinity);
  });
  test('matches local-name aliases', () => {
    expect(matchTerms('Brinjal')).toEqual(expect.arrayContaining(['brinjal', 'eggplant']));
    expect(scorePhoto(photo('Purple eggplants in a basket'), 'Brinjal', 'Vegetables')).toBeGreaterThan(0);
  });
  test('does not match a crop name inside a longer unrelated word', () => {
    expect(scorePhoto(photo('Orangery building exterior'), 'Orange', 'Fruits')).toBe(-Infinity);
  });
});

describe('createCropImageResolver', () => {
  test('returns null without an API key and never calls the network', async () => {
    const fetchImpl = jest.fn();
    const { resolveCropImage } = createCropImageResolver({ apiKey: '', fetchImpl });
    expect(await resolveCropImage('Orange', 'Fruits')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('queries by category, picks a verified photo and returns attribution', async () => {
    const fetchImpl = jest.fn(async () => okResponse([photo('Orange background'), photo('Fresh oranges on a wooden table')]));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl });
    const result = await resolveCropImage('Orange', 'Fruits');
    expect(result.url).toContain('Fresh%20oranges');
    expect(result.credit).toBe('Photo by Jane Doe on Pexels');
    expect(decodeURIComponent(fetchImpl.mock.calls[0][0])).toContain('query=orange fruit');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('k');
  });

  test('tries the next query when the first has no verified match', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(okResponse([photo('A tractor in a field')]))
      .mockResolvedValueOnce(okResponse([photo('Fresh carrots in soil')]));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl });
    const result = await resolveCropImage('Carrot', 'Vegetables');
    expect(result.url).toContain('carrots');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('returns null (honest placeholder) rather than an unrelated photo', async () => {
    const fetchImpl = jest.fn(async () => okResponse([photo('Sunset over hills'), photo('Cartoon orange')]));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl });
    expect(await resolveCropImage('Orange', 'Fruits')).toBeNull();
  });

  test('caches successes so repeated listings cost one lookup', async () => {
    const fetchImpl = jest.fn(async () => okResponse([photo('Fresh oranges')]));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl });
    await resolveCropImage('Orange', 'Fruits');
    await resolveCropImage('orange ', 'Fruits');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('de-duplicates concurrent lookups for the same crop', async () => {
    const fetchImpl = jest.fn(async () => okResponse([photo('Fresh oranges')]));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl });
    await Promise.all([resolveCropImage('Orange', 'Fruits'), resolveCropImage('Orange', 'Fruits'), resolveCropImage('Orange', 'Fruits')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a failure is cached only briefly - it recovers (the original cached null forever)', async () => {
    let clock = 1000;
    const fetchImpl = jest.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(okResponse([photo('Fresh oranges')]));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl, now: () => clock, logger: silent });
    expect(await resolveCropImage('Orange', 'Fruits')).toBeNull();
    clock += 60 * 1000; // still inside the failure TTL -> not retried
    expect(await resolveCropImage('Orange', 'Fruits')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 11 * 60 * 1000; // past the TTL -> retried and now succeeds
    expect((await resolveCropImage('Orange', 'Fruits')).url).toContain('oranges');
  });

  test('backs off after a 429 instead of hammering Pexels', async () => {
    let clock = 0;
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl, now: () => clock });
    await resolveCropImage('Orange', 'Fruits');
    await resolveCropImage('Carrot', 'Vegetables');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a non-OK response yields null and never throws', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const { resolveCropImage } = createCropImageResolver({ apiKey: 'k', fetchImpl });
    await expect(resolveCropImage('Orange', 'Fruits')).resolves.toBeNull();
  });
});

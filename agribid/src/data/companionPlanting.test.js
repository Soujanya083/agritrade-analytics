import {
  CROPS, CATEGORIES, CATEGORY_META, STATUS_META, PAIRS, SOURCES, GENERAL_PRINCIPLES,
  filterCrops, findCrop, checkPair, pairsFor, alternativesFor, catalogStats, validateCatalog, sourceList,
} from './companionPlanting';

const names = (list) => list.map((c) => c.name);
const pairOf = (a, b) => PAIRS.find((p) => (p.a === a && (p.b === b || (p.b && p.b.name && p.b.name.startsWith(b)))));

describe('catalog size and integrity', () => {
  test('at least 25 crops in each of the four categories, and at least 100 in total', () => {
    const { byCategory, total } = catalogStats();
    ['Fruits', 'Grains', 'Vegetables', 'Leafy'].forEach((k) => expect(byCategory[k]).toBeGreaterThanOrEqual(25));
    expect(total).toBeGreaterThanOrEqual(100);
    expect(total).toBe(CROPS.length);
  });
  test('the verified counts (these are the numbers reported to the user)', () => {
    expect(catalogStats().byCategory).toEqual({ Fruits: 29, Grains: 30, Vegetables: 31, Leafy: 26 });
    expect(CROPS).toHaveLength(116);
  });
  test('the catalog has no duplicate ids, names, aliases or icons and no malformed record', () => {
    expect(validateCatalog()).toEqual([]);
  });
  test('every crop has a category that exists, a botanical family, and an icon spec', () => {
    CROPS.forEach((c) => {
      expect(Boolean(CATEGORY_META[c.category])).toBe(true);
      expect(c.family.length).toBeGreaterThan(3);
      expect(['emoji', 'svg']).toContain(c.icon.type);
      expect(c.iconKey.length).toBeGreaterThan(6);
    });
  });
  test('categories are correct for spot checks, including crops that were previously miscategorised', () => {
    const cat = (n) => findCrop(n).category;
    expect(cat('Spinach')).toBe('Leafy');
    expect(cat('Fenugreek')).toBe('Leafy');
    expect(cat('Wheat')).toBe('Grains');
    expect(cat('Chickpea')).toBe('Grains');
    expect(cat('Mango')).toBe('Fruits');
    expect(cat('Orange')).toBe('Fruits');
    expect(cat('Tomato')).toBe('Vegetables');
    expect(cat('Onion')).toBe('Vegetables');
  });
  test('botanical families are right for crops the guidance depends on', () => {
    const fam = (n) => findCrop(n).family;
    expect(fam('Tomato')).toBe('Solanaceae');
    expect(fam('Potato')).toBe('Solanaceae');
    expect(fam('Wheat')).toBe('Poaceae');
    expect(fam('Rice')).toBe('Poaceae');
    expect(fam('Chickpea')).toBe('Fabaceae');
    expect(fam('Soybean')).toBe('Fabaceae');
    expect(fam('Mustard')).toBe('Brassicaceae');
  });
  test('names are normalised: no stray spaces, no case duplicates', () => {
    const lowered = CROPS.map((c) => c.name.trim().toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
    CROPS.forEach((c) => expect(c.name).toBe(c.name.trim().replace(/\s+/g, ' ')));
  });
  test('emoji icons are limited to widely supported ones and each is used once', () => {
    const emojis = CROPS.filter((c) => c.icon.type === 'emoji').map((c) => c.icon.value);
    expect(new Set(emojis).size).toBe(emojis.length);
    ['🫛', '🫘', '🫚', '🫑'].forEach((newer) => expect(emojis).not.toContain(newer));
  });
  test('the crops that previously showed one generic icon now have their own distinct icon', () => {
    const generic = CROPS.filter((c) => c.icon.type === 'emoji' && ['🌱', '🌿'].includes(c.icon.value));
    expect(generic).toEqual([]);
    expect(new Set(CROPS.map((c) => c.iconKey)).size).toBe(CROPS.length);
  });
});

describe('evidence registry', () => {
  test('every pair has at least one source, all sources exist, and every link is https', () => {
    PAIRS.forEach((p) => {
      expect(p.sources.length).toBeGreaterThan(0);
      p.sources.forEach((id) => expect(Boolean(SOURCES[id])).toBe(true));
    });
    Object.values(SOURCES).forEach((s) => expect(s.url.startsWith('https://')).toBe(true));
  });
  test('no pair rests only on a weak secondary source, and no source is listed twice', () => {
    PAIRS.forEach((p) => expect(p.sources.some((id) => SOURCES[id].type !== 'secondary')).toBe(true));
    Object.values(GENERAL_PRINCIPLES).forEach((g) => expect(g.sources.some((id) => SOURCES[id].type !== 'secondary')).toBe(true));
    const urls = Object.values(SOURCES).map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
  test('every registered source is actually cited somewhere (no decorative references)', () => {
    const cited = new Set([...PAIRS.flatMap((p) => p.sources), ...Object.values(GENERAL_PRINCIPLES).flatMap((g) => g.sources)]);
    const orphans = Object.keys(SOURCES).filter((id) => !cited.has(id));
    expect(orphans).toEqual([]);
  });
  test('statuses are only the allowed ones and "insufficient" is never stored as a recommendation', () => {
    PAIRS.forEach((p) => expect(['supported', 'potential', 'unsuitable']).toContain(p.status));
    expect(Object.keys(STATUS_META).sort()).toEqual(['insufficient', 'potential', 'supported', 'unsuitable']);
  });
  test('supported and potential pairs always disclose risks or conditions, never a bare benefit', () => {
    PAIRS.filter((p) => p.status !== 'unsuitable').forEach((p) => {
      expect(p.risks.length + p.conditions.length).toBeGreaterThan(0);
      expect(p.benefits.length).toBeGreaterThan(0);
    });
  });
  test('unsuitable pairs name the documented risk and claim no benefit', () => {
    PAIRS.filter((p) => p.status === 'unsuitable').forEach((p) => {
      expect(p.risks.length).toBeGreaterThan(0);
      expect(p.benefits).toEqual([]);
    });
  });
  test('sourceList returns title, url and type for each id', () => {
    const list = sourceList(['wheatMustardIjas']);
    expect(list[0].title.length).toBeGreaterThan(10);
    expect(list[0].type).toBe('peer-reviewed');
  });
});

describe('claims that were corrected', () => {
  test('wheat + mustard: mustard is described as aggressive, tight ratios as harmful, best ratio as variable', () => {
    const p = pairOf('wheat', 'mustard');
    const text = [p.summary, ...p.risks, ...p.conditions].join(' ');
    expect(text).toMatch(/aggressive|out-competes/);
    expect(text).toMatch(/2 wheat : 1 mustard|2:2/);
    expect(text).toMatch(/differed between studies/);
    expect(p.status).toBe('supported');
  });
  test('the earlier unsupported "1 mustard row per 5-9 wheat rows" rule is no longer stated as fact', () => {
    JSON.stringify(PAIRS).split('"').forEach((chunk) => expect(chunk).not.toMatch(/1 mustard row per 5-9/));
  });
  test('rice-duck: weed control is supported but insect-pest control is explicitly inconsistent', () => {
    const p = pairOf('rice', 'Ducks');
    expect(p.summary).toMatch(/weed/i);
    expect(p.risks.join(' ')).toMatch(/inconsistent/);
    expect(p.risks.join(' ')).toMatch(/planthopper/);
  });
  test('rice-azolla: described as supplementing fertilizer, not replacing it', () => {
    const p = pairOf('rice', 'Azolla');
    expect(p.risks.join(' ')).toMatch(/supplements fertilizer rather than replacing/);
  });
  test('maize + desmodium push-pull is flagged as East African evidence, not an Indian trial', () => {
    const p = pairOf('maize', 'Desmodium');
    expect(p.region).toMatch(/not an Indian trial/);
  });
  test('pigeonpea + sorghum discloses the large pigeonpea yield loss from competition', () => {
    expect(pairOf('pigeon-pea', 'sorghum').risks.join(' ')).toMatch(/fell sharply/);
  });
  test('maize + beans is only "potential" because the studies disagree', () => {
    const p = pairOf('maize', 'beans');
    expect(p.status).toBe('potential');
    expect(p.risks.join(' ')).toMatch(/lower than sole crops/);
  });
  test('maize + tomato is flagged unsuitable but with its conditions and the species caveat', () => {
    const p = pairOf('maize', 'tomato');
    expect(p.status).toBe('unsuitable');
    expect(p.conditions.join(' ')).toMatch(/India is a related species/);
  });
});

describe('claims that were removed (no reliable source found)', () => {
  const removed = [['onion', 'carrot'], ['onion', 'beans'], ['onion', 'peas'], ['garlic', 'peas'], ['garlic', 'beans'], ['cucumber', 'potato'],
    ['cabbage', 'dill'], ['cotton', 'green gram'], ['sugarcane', 'potato'], ['brinjal', 'beans'], ['tomato', 'basil'], ['potato', 'beans'],
    ['maize', 'pumpkin'], ['chilli', 'basil'], ['okra', 'cucumber'], ['carrot', 'radish'], ['cabbage', 'tomato'], ['mango', 'ginger']];
  removed.forEach(([a, b]) => {
    test(`${a} + ${b} is not recommended or condemned: insufficient evidence`, () => {
      expect(checkPair(a, b).verdict).toBe('insufficient');
    });
  });
});

describe('pair checker outcomes', () => {
  test('supported, potential, unsuitable and insufficient are all reachable', () => {
    expect(checkPair('Wheat', 'Chickpea').verdict).toBe('supported');
    expect(checkPair('Maize', 'Beans').verdict).toBe('potential');
    expect(checkPair('Tomato', 'Potato').verdict).toBe('unsuitable');
    expect(checkPair('Banana', 'Wheat').verdict).toBe('insufficient');
  });
  test('the answer is the same in either order and works with local names', () => {
    expect(checkPair('Mustard', 'Wheat').verdict).toBe('supported');
    expect(checkPair('gehu', 'sarson').verdict).toBe('supported');
    expect(checkPair('aloo', 'tamatar').verdict).toBe('unsuitable');
  });
  test('a supported answer carries explanation, benefits, risks, conditions and sources', () => {
    const r = checkPair('Wheat', 'Mustard');
    expect(r.message.length).toBeGreaterThan(40);
    expect(r.pair.benefits.length).toBeGreaterThan(0);
    expect(r.pair.risks.length).toBeGreaterThan(0);
    expect(r.pair.conditions.length).toBeGreaterThan(0);
    expect(r.pair.sourceList.length).toBeGreaterThan(2);
    r.pair.sourceList.forEach((s) => expect(s.url.startsWith('https://')).toBe(true));
  });
  test('insufficient evidence says so plainly, does not claim incompatibility, and offers alternatives for both crops', () => {
    const r = checkPair('Banana', 'Wheat');
    expect(r.message).toMatch(/No field research was found/);
    expect(r.message).toMatch(/does not mean they are incompatible/);
    expect(r.sameFamily).toBe(false);
    expect(Object.keys(r.alternatives)).toEqual(['banana', 'wheat']);
    expect(r.alternatives.wheat.verified.map((v) => v.partner)).toContain('Mustard');
    expect(r.alternatives.wheat.principles.length).toBeGreaterThan(1);
  });
  test('two crops of the same botanical family get a rotation caution instead of a recommendation', () => {
    const r = checkPair('Rice', 'Wheat');
    expect(r.verdict).toBe('insufficient');
    expect(r.sameFamily).toBe(true);
    expect(r.message).toMatch(/Poaceae family/);
    expect(r.message).toMatch(/rotate/);
    expect(checkPair('Brinjal', 'Capsicum').sameFamily).toBe(true);
  });
  test('missing, unknown or identical crops are handled without throwing', () => {
    expect(checkPair('', 'Wheat').verdict).toBe('invalid');
    expect(checkPair('Wheat', 'Dragonfruitzilla').verdict).toBe('invalid');
    expect(checkPair('Wheat', 'wheat').verdict).toBe('invalid');
    expect(checkPair(undefined, null).verdict).toBe('invalid');
  });
});

describe('alternatives are always available and sourced', () => {
  test('every one of the crops gets sourced general principles, never an empty screen', () => {
    CROPS.forEach((c) => {
      const alt = alternativesFor(c);
      expect(alt.principles.length).toBeGreaterThanOrEqual(2);
      alt.principles.forEach((p) => expect(p.sourceList.length).toBeGreaterThan(0));
    });
  });
  test('cereals and legumes get the nitrogen principle; every crop gets the family-rotation rule naming its family', () => {
    expect(alternativesFor(findCrop('Wheat')).principles.map((p) => p.key)).toContain('legume');
    expect(alternativesFor(findCrop('Chickpea')).principles.map((p) => p.key)).toContain('legume');
    expect(alternativesFor(findCrop('Mango')).principles.map((p) => p.key)).not.toContain('legume');
    expect(alternativesFor(findCrop('Mango')).principles.find((p) => p.key === 'family').family).toBe('Anacardiaceae');
  });
  test('verified partners listed for a crop are exactly the supported or potential pairs', () => {
    expect(alternativesFor(findCrop('Tomato')).verified.map((v) => v.partner)).toEqual(['French or African marigold (Tagetes)']);
    expect(alternativesFor(findCrop('Mango')).verified).toEqual([]);
  });
  test('the documented number of pairings matches the data: 10 supported, 11 potential, 2 unsuitable', () => {
    const count = (status) => PAIRS.filter((p) => p.status === status).length;
    expect(PAIRS).toHaveLength(23);
    expect([count('supported'), count('potential'), count('unsuitable')]).toEqual([10, 11, 2]);
  });
  test('only a minority of crops have a verified pairing, which is the honest picture', () => {
    const withPairs = CROPS.filter((c) => pairsFor(c.id).all.length > 0).length;
    expect(withPairs).toBeGreaterThan(5);
    expect(withPairs).toBeLessThanOrEqual(CROPS.length / 3);
  });
});

describe('search and filters', () => {
  test('the Leafy filter returns only leafy crops and the other filters stay correct', () => {
    expect(filterCrops({ category: 'Leafy' })).toHaveLength(26);
    expect(filterCrops({ category: 'Leafy' }).every((c) => c.category === 'Leafy')).toBe(true);
    expect(filterCrops({ category: 'Fruits' })).toHaveLength(29);
    expect(filterCrops({ category: 'Grains' })).toHaveLength(30);
    expect(filterCrops({ category: 'Vegetables' })).toHaveLength(31);
    expect(CATEGORIES).toEqual(['All Crops', 'Fruits', 'Grains', 'Vegetables', 'Leafy']);
  });
  test('search matches names, local names, botanical families and verified partners', () => {
    expect(names(filterCrops({ query: 'wheat' }))).toContain('Wheat');
    expect(names(filterCrops({ query: 'gehu' }))).toEqual(['Wheat']);
    expect(names(filterCrops({ query: 'baingan' }))).toEqual(['Brinjal']);
    expect(names(filterCrops({ query: 'solanaceae' }))).toContain('Tomato');
    expect(names(filterCrops({ query: 'azolla' }))).toEqual(['Rice']);
    expect(names(filterCrops({ query: 'marigold' }))).toEqual(['Tomato']);
  });
  test('category and search combine; no match gives an empty list; blank returns everything', () => {
    expect(filterCrops({ category: 'Fruits', query: 'wheat' })).toEqual([]);
    expect(filterCrops({ query: 'zzzz-nothing' })).toEqual([]);
    expect(filterCrops({})).toHaveLength(CROPS.length);
    expect(names(filterCrops({ query: '  RICE ' }))).toContain('Rice');
  });
  test('findCrop resolves names, ids and aliases and returns null otherwise', () => {
    expect(findCrop('Pearl Millet').id).toBe('pearl-millet');
    expect(findCrop('bajra').name).toBe('Pearl Millet');
    expect(findCrop('toor dal').name).toBe('Pigeon Pea');
    expect(findCrop('nope')).toBeNull();
    expect(findCrop('')).toBeNull();
  });
});


describe('pairings added after a second research round (2026-10-24)', () => {
  test('sugarcane + onion was removed earlier for lack of a source and is back only with real sources', () => {
    const r = checkPair('sugarcane', 'onion');
    expect(r.verdict).toBe('potential');
    expect(r.pair.sources).toContain('sugarcaneOnionTnau');
  });
  test('lentil, which had no pairing, now has researched ones with risks listed', () => {
    ['wheat', 'mustard'].forEach((partner) => {
      const r = checkPair('lentil', partner);
      expect(r.verdict).toBe('supported');
      expect(r.pair.risks.length).toBeGreaterThan(0);
    });
    expect(pairsFor('lentil').all.length).toBeGreaterThanOrEqual(2);
  });
  test('finger millet + pigeonpea is potential because the evidence is mixed, and the old caution is shown', () => {
    const r = checkPair('finger-millet', 'pigeon-pea');
    expect(r.verdict).toBe('potential');
    expect(r.pair.risks.join(' ')).toMatch(/1980/);
  });
});

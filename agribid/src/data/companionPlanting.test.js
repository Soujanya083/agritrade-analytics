import {
  CROPS, BENEFITS, EVIDENCE, CATEGORIES, CATEGORY_META, filterCrops, findCrop, checkPair, matchesQuery,
} from './companionPlanting';

describe('companion planting data integrity', () => {
  test('has at least the crops the app needs, including Wheat and Rice (previously missing)', () => {
    expect(CROPS.length).toBeGreaterThanOrEqual(30);
    expect(findCrop('Wheat')).not.toBeNull();
    expect(findCrop('Rice')).not.toBeNull();
  });

  test('ids and names are unique', () => {
    expect(new Set(CROPS.map((c) => c.id)).size).toBe(CROPS.length);
    expect(new Set(CROPS.map((c) => c.name.toLowerCase())).size).toBe(CROPS.length);
  });

  test('every crop is well-formed', () => {
    CROPS.forEach((c) => {
      expect(typeof c.name).toBe('string');
      expect(CATEGORY_META[c.category]).toBeTruthy();
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.season.length).toBeGreaterThan(0);
      expect(EVIDENCE[c.evidence]).toBeTruthy();
      expect(c.tip.length).toBeGreaterThan(10);
      expect(c.friends.length).toBeGreaterThan(0);
      expect(Array.isArray(c.foes)).toBe(true);
    });
  });

  test('every companion has an emoji, a reason, and a known benefit tag', () => {
    CROPS.forEach((c) => {
      c.friends.forEach((fr) => {
        expect(fr.emoji.length).toBeGreaterThan(0);
        expect(fr.why.length).toBeGreaterThan(10);
        expect(BENEFITS[fr.benefit]).toBeTruthy();
      });
      c.foes.forEach((fo) => {
        expect(fo.emoji.length).toBeGreaterThan(0);
        expect(fo.why.length).toBeGreaterThan(5);
      });
    });
  });

  test('no crop lists itself, and nothing is both a friend and a foe', () => {
    CROPS.forEach((c) => {
      const friends = c.friends.map((x) => x.name.toLowerCase());
      const foes = c.foes.map((x) => x.name.toLowerCase());
      expect(friends).not.toContain(c.name.toLowerCase());
      expect(foes).not.toContain(c.name.toLowerCase());
      friends.forEach((n) => expect(foes).not.toContain(n));
    });
  });

  test('field-layout patterns only reference real companions', () => {
    CROPS.filter((c) => c.layout && c.layout.type === 'rows').forEach((c) => {
      c.layout.pattern.forEach((p) => {
        if (p !== 'main') expect(c.friends[p]).toBeTruthy();
      });
      expect(c.layout.pattern).toContain('main');
    });
    CROPS.filter((c) => c.layout && c.layout.type === 'layers').forEach((c) => {
      c.layout.pattern.forEach((layer) => {
        expect(layer.emoji.length).toBeGreaterThan(0);
        expect(layer.label.length).toBeGreaterThan(0);
      });
    });
  });

  test('crops backed by trials are labelled as such (wheat, rice, chickpea, pigeon pea)', () => {
    ['Wheat', 'Rice', 'Chickpea', 'Pigeon Pea'].forEach((n) => expect(findCrop(n).evidence).toBe('research'));
  });

  test('the original unsupported claim about sugarcane vs mustard is gone (autumn cane + mustard is a real intercrop)', () => {
    const sugarcane = findCrop('Sugarcane');
    expect(sugarcane.foes.map((x) => x.name)).not.toContain('Mustard');
    expect(sugarcane.friends.map((x) => x.name)).toContain('Mustard');
  });
});

describe('search and filters', () => {
  test('finds a crop by name', () => {
    expect(filterCrops({ query: 'wheat' }).map((c) => c.name)).toContain('Wheat');
  });
  test('finds a crop by local-language alias', () => {
    expect(filterCrops({ query: 'gehu' }).map((c) => c.name)).toContain('Wheat');
    expect(filterCrops({ query: 'baingan' }).map((c) => c.name)).toContain('Brinjal');
  });
  test('searching a companion lists every crop that mentions it', () => {
    const names = filterCrops({ query: 'marigold' }).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Tomato', 'Cabbage', 'Brinjal']));
  });
  test('category filter works and combines with search', () => {
    const fruits = filterCrops({ category: 'Fruits' });
    expect(fruits.length).toBeGreaterThan(3);
    fruits.forEach((c) => expect(c.category).toBe('Fruits'));
    expect(filterCrops({ category: 'Fruits', query: 'wheat' })).toEqual([]);
  });
  test('"All Crops" and empty query return everything', () => {
    expect(filterCrops({}).length).toBe(CROPS.length);
    expect(CATEGORIES[0]).toBe('All Crops');
  });
  test('a query with no matches returns an empty list (UI shows an empty state)', () => {
    expect(filterCrops({ query: 'zzzz-nothing' })).toEqual([]);
  });
  test('matchesQuery is case-insensitive and trims', () => {
    expect(matchesQuery(findCrop('Rice'), '  RICE ')).toBe(true);
  });
});

describe('pair checker', () => {
  test('good pair, checked in either direction', () => {
    expect(checkPair('Wheat', 'Chickpea').verdict).toBe('good');
    expect(checkPair('Chickpea', 'Wheat').verdict).toBe('good');
  });
  test('works via aliases', () => {
    expect(checkPair('gehu', 'chana').verdict).toBe('good');
  });
  test('avoid pair, including when only ONE crop documents it', () => {
    expect(checkPair('Tomato', 'Potato').verdict).toBe('avoid');
    expect(checkPair('Potato', 'Tomato').verdict).toBe('avoid');
    expect(checkPair('Maize', 'Tomato').verdict).toBe('avoid');
  });
  test('says plainly when nothing is documented instead of guessing', () => {
    const result = checkPair('Wheat', 'Banana');
    expect(result.verdict).toBe('unknown');
    expect(result.message).toMatch(/does not mean it is harmful/i);
  });
  test('handles unknown crops and identical crops', () => {
    expect(checkPair('Wheat', 'Dragonfruit').verdict).toBe('unknown');
    expect(checkPair('Wheat', 'wheat').verdict).toBe('unknown');
  });
  test('conflicting sources produce a cautious "mixed" verdict', () => {
    const a = { id: 'a', name: 'A', aliases: [], friends: [{ name: 'B', why: 'helps' }], foes: [] };
    const b = { id: 'b', name: 'B', aliases: [], friends: [], foes: [{ name: 'A', why: 'harms' }] };
    expect(checkPair('A', 'B', [a, b]).verdict).toBe('mixed');
  });
});

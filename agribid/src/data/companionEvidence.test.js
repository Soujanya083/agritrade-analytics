import { PAIRS } from './companionPairs';
import { SOURCES } from './companionSources';
import { CLAIMS } from './companionClaims';
import {
  deriveStatus, countEvidence, figuresShown, verifiedFigures, claimsFor, pairKey, evidenceBadges, PRIMARY_TYPES,
} from './companionEvidence';

const label = (p) => pairKey(p);

describe('status is derived from the evidence, not chosen by hand', () => {
  test('every stored status equals the status the rules derive from the registered sources', () => {
    PAIRS.forEach((p) => expect([label(p), p.status]).toEqual([label(p), deriveStatus(p)]));
  });
  test('supported needs two primary studies; a review alone can only support \"potential\"', () => {
    PAIRS.filter((p) => p.status === 'supported').forEach((p) => expect(countEvidence(p).primary).toBeGreaterThanOrEqual(2));
    PAIRS.filter((p) => countEvidence(p).primary === 0 && p.kind !== 'conflict').forEach((p) => expect(p.status).toBe('potential'));
  });
  test('unsuitable pairs are documented conflicts backed by at least two extension or research sources', () => {
    PAIRS.filter((p) => p.status === 'unsuitable').forEach((p) => {
      expect(p.kind).toBe('conflict');
      const e = countEvidence(p);
      expect(e.primary + e.extension).toBeGreaterThanOrEqual(2);
    });
  });
  test('mixed results can never be \"supported\"', () => {
    PAIRS.filter((p) => p.consistency === 'mixed').forEach((p) => expect(p.status).not.toBe('supported'));
  });
  test('the two pairings that were downgraded by these rules are potential, with the reason on record', () => {
    const azolla = PAIRS.find((p) => p.b && p.b.name && p.b.name.startsWith('Azolla'));
    const fish = PAIRS.find((p) => p.b && p.b.name && p.b.name.startsWith('Fish'));
    expect([azolla.status, fish.status]).toEqual(['potential', 'potential']);
    expect(countEvidence(azolla).primary).toBe(1);
    expect(countEvidence(fish).primary).toBe(0);
  });
  test('every pair declares how consistent its results are', () => {
    PAIRS.forEach((p) => expect(['consistent', 'mixed']).toContain(p.consistency));
  });
});

describe('every number shown to users is traceable to a verified claim', () => {
  test('each figure in the pair text appears in a verified ledger entry for that pair', () => {
    PAIRS.forEach((p) => {
      const allowed = verifiedFigures(p);
      figuresShown(p).forEach((figure) => expect([label(p), figure, allowed.includes(figure)]).toEqual([label(p), figure, true]));
    });
  });
  test('unverified figures never appear in the text users read', () => {
    CLAIMS.filter((c) => c.status !== 'verified').forEach((c) => {
      const pair = PAIRS.find((p) => label(p) === c.pair);
      expect(Boolean(pair)).toBe(true);
      c.figures.forEach((figure) => expect(figuresShown(pair)).not.toContain(figure));
    });
  });
  test('the ledger is well formed: known pair, known source (or flagged as not recorded), valid status and date', () => {
    const keys = PAIRS.map(label);
    const ids = CLAIMS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    CLAIMS.forEach((c) => {
      expect(keys).toContain(c.pair);
      expect(c.figures.length).toBeGreaterThan(0);
      expect(['verified', 'unverified']).toContain(c.status);
      if (c.source !== null) expect(Boolean(SOURCES[c.source])).toBe(true);
      if (c.status === 'verified') {
        expect(c.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(c.source).not.toBeNull();
        expect(c.locator.length).toBeGreaterThan(3);
      } else {
        expect(c.checkedOn).toBeNull();
      }
    });
  });
  test('a verified claim cites a source that is actually listed for its pair', () => {
    CLAIMS.filter((c) => c.status === 'verified').forEach((c) => {
      const pair = PAIRS.find((p) => label(p) === c.pair);
      expect(pair.sources).toContain(c.source);
    });
  });
  test('the maize + soybean figure and two wheat + chickpea figures were checked; one wheat + chickpea figure is pending', () => {
    const verified = CLAIMS.filter((c) => c.status === 'verified').map((c) => c.id).sort();
    expect(verified).toEqual(['maize-soybean-ler', 'wheat-chickpea-bangladesh', 'wheat-chickpea-nsw']);
    expect(claimsFor(PAIRS.find((p) => label(p) === 'wheat+chickpea'))).toHaveLength(3);
  });
});

describe('source registry hygiene', () => {
  test('every source has a title, an https link and a known type; verifiedOn is a date when present', () => {
    Object.entries(SOURCES).forEach(([id, s]) => {
      expect(s.title.length).toBeGreaterThan(10);
      expect(s.url.startsWith('https://')).toBe(true);
      expect(['peer-reviewed', 'institute', 'extension', 'review', 'secondary']).toContain(s.type);
      if (s.verifiedOn !== undefined) expect(s.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
  test('only primary types count as studies, and secondary sources never do', () => {
    expect(PRIMARY_TYPES).toEqual(['peer-reviewed', 'institute']);
    PAIRS.forEach((p) => {
      const e = countEvidence(p);
      expect(e.primary + e.reviews + e.extension + e.secondary).toBe(p.sources.length);
    });
  });
});

describe('badges for the interface', () => {
  test('Indian evidence is only claimed when the evidence region starts with India', () => {
    const badge = (a, b) => evidenceBadges(PAIRS.find((p) => p.a === a && (p.b === b || (p.b.name && p.b.name.startsWith(b)))));
    expect(badge('wheat', 'mustard').indian).toBe(true);
    expect(badge('wheat', 'chickpea').indian).toBe(false);
    expect(badge('maize', 'Desmodium').indian).toBe(false);
    expect(badge('wheat', 'chickpea').studies).toBe(4);
    expect(badge('wheat', 'chickpea').pendingClaims).toBe(1);
  });
});

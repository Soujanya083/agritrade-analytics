// companionEvidence.js - the rules that decide HOW MUCH a pairing may claim, and the checks that enforce them.
//
// A pairing's status is DERIVED from its registered sources, not chosen by hand (companionEvidence.test.js fails
// if the stored status differs from the derived one):
//   unsuitable   kind 'conflict' (a documented shared pest or disease) AND at least 2 extension or research sources
//   supported    at least 2 primary studies (peer-reviewed or research-institute) AND the benefit is reported consistently
//   potential    at least 1 research source (primary study or review), or mixed results
//   (nothing)    no research source: the tool says "insufficient evidence" instead
// Secondary sources (blogs, aggregators) never count. Reviews count only towards 'potential'.
// Every figure shown to users must appear in a VERIFIED entry of companionClaims.js.

import { PAIRS } from './companionPairs';
import { SOURCES } from './companionSources';
import { CLAIMS } from './companionClaims';

export const PRIMARY_TYPES = ['peer-reviewed', 'institute'];
const slugify = (t) => String(t).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const pairKey = (pair) => `${pair.a}+${typeof pair.b === 'string' ? pair.b : slugify(String(pair.b.name).split(' (')[0])}`;

export function countEvidence(pair) {
  const types = pair.sources.map((id) => (SOURCES[id] ? SOURCES[id].type : 'missing'));
  const count = (...wanted) => types.filter((t) => wanted.includes(t)).length;
  return { primary: count(...PRIMARY_TYPES), reviews: count('review'), extension: count('extension'), secondary: count('secondary') };
}

export function deriveStatus(pair) {
  const e = countEvidence(pair);
  if (pair.kind === 'conflict') return e.primary + e.extension >= 2 ? 'unsuitable' : null;
  if (e.primary >= 2 && pair.consistency === 'consistent') return 'supported';
  if (e.primary + e.reviews >= 1) return 'potential';
  return null;
}

// Numbers like 1.32 or 14% in the text a user reads.
export const FIGURE_RE = /\d+(?:\.\d+)?%|\d+\.\d+/g;
export function figuresShown(pair) {
  const text = [pair.summary, ...pair.benefits, ...pair.risks, ...pair.conditions].join(' ');
  return [...new Set(text.match(FIGURE_RE) || [])];
}

export const claimsFor = (pair) => CLAIMS.filter((c) => c.pair === pairKey(pair));
export const verifiedFigures = (pair) => claimsFor(pair).filter((c) => c.status === 'verified').flatMap((c) => c.figures);

// Small facts for the UI badges.
export function evidenceBadges(pair) {
  const e = countEvidence(pair);
  const claims = claimsFor(pair);
  return {
    studies: e.primary,
    reviews: e.reviews,
    indian: /^India/i.test(pair.region || ''),
    verifiedClaims: claims.filter((c) => c.status === 'verified').length,
    pendingClaims: claims.filter((c) => c.status !== 'verified').length,
  };
}

export const allPairs = () => PAIRS;

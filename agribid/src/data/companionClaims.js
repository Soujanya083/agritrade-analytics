// companionClaims.js - the claim ledger: every NUMBER the Companion Planting tab shows must be traceable here.
//
// status 'verified'   the figure was checked against the source's abstract or full text on `checkedOn`
//        'unverified' the figure came from earlier notes and has NOT been re-checked. It is NOT shown to users
//                     (companionEvidence.test.js fails if an unverified figure appears in the pair text).
//
// To use an unverified figure: open the source, find the number, set status 'verified' + checkedOn + locator,
// then you may put the figure back into the pair text. `pair` is the key from companionEvidence.pairKey().

export const CLAIMS = [
  {
    id: 'maize-soybean-ler', pair: 'maize+soybean', figures: ['1.32'], status: 'verified', checkedOn: '2026-10-24',
    source: 'maizeSoybeanMeta', locator: 'abstract',
    text: 'Global meta-analysis (47 English-language and 43 Chinese-language studies): average land equivalent ratio of maize/soybean intercropping 1.32; fertilizer N equivalent ratio 1.44.',
  },
  {
    id: 'wheat-chickpea-bangladesh', pair: 'wheat+chickpea', figures: ['1.23'], status: 'verified', checkedOn: '2026-10-24',
    source: 'wheatChickpeaBangladesh', locator: 'abstract (six experiments)',
    text: 'Average land equivalent ratio for wheat/chickpea 1.23 (wheat/lentil 1.27, wheat/mustard 1.39); in most trials the sole crops at the full seed rate out-yielded the mixtures.',
  },
  {
    id: 'wheat-chickpea-nsw', pair: 'wheat+chickpea', figures: ['14%'], status: 'verified', checkedOn: '2026-10-24',
    source: 'wheatChickpeaGrdc', locator: 'results text',
    text: 'Wheat/chickpea mixes needed on average 14% less land than monocultures to produce the same amount of grain.',
  },
  {
    id: 'wheat-chickpea-ijra-1.39', pair: 'wheat+chickpea', figures: ['1.39'], status: 'unverified', checkedOn: null,
    source: 'wheatChickpeaIjra', locator: 'not located',
    text: 'Earlier note: wheat + chickpea in 2:2 rows gave a land equivalent ratio of 1.39 (2024 article).',
    note: 'The article could not be retrieved on 2026-10-24. The figure 1.39 appears for WHEAT + MUSTARD in the Bangladesh study, so check the table in the article before using it.',
  },
  {
    id: 'wheat-mustard-ler-range', pair: 'wheat+mustard', figures: ['1.1', '1.5'], status: 'unverified', checkedOn: null,
    source: 'wheatMustardIjas', locator: 'not checked',
    text: 'Earlier note: land equivalent ratio roughly 1.1 to 1.5 across several Indian trials.',
  },
  {
    id: 'chickpea-mustard-ler', pair: 'chickpea+mustard', figures: ['1.7'], status: 'unverified', checkedOn: null,
    source: 'mustardBundelkhand', locator: 'not checked',
    text: 'Earlier note: land equivalent ratio up to about 1.7 in a Bundelkhand trial.',
  },
  {
    id: 'pigeonpea-sorghum-loss', pair: 'pigeon-pea+sorghum', figures: ['38%'], status: 'unverified', checkedOn: null,
    source: null, locator: 'source not recorded',
    text: 'Earlier note: pigeonpea grain yield fell by up to about 38% in one comparison.',
    note: 'The source of this figure was not recorded. Find which of the four cited sources states it.',
  },
  {
    id: 'wheat-lentil-hawalbagh', pair: 'wheat+lentil', figures: ['1.19'], status: 'verified', checkedOn: '2026-10-24',
    source: 'wheatLentilHawalbagh', locator: 'abstract',
    text: 'Hawalbagh (Uttarakhand) rabi trials 2008-10: wheat + lentil in 2:1 rows gave the highest wheat-equivalent yield and a land-equivalent ratio of 1.19, followed by 1:1 rows.',
  },
  {
    id: 'lentil-mustard-bihar', pair: 'lentil+mustard', figures: ['1.54'], status: 'verified', checkedOn: '2026-10-24',
    source: 'lentilMustardBihar', locator: 'abstract and results table',
    text: 'Bihar plateau 1995-98: 100% lentil + 25% mustard in a 5:1 row ratio gave a land-equivalent ratio of 1.54; grain yield of both crops decreased in the other arrangements.',
  },
  {
    id: 'sugarcane-garlic-pusa', pair: 'sugarcane+garlic', figures: ['1.30'], status: 'verified', checkedOn: '2026-10-24',
    source: 'sugarcaneGarlicPusa', locator: 'abstract',
    text: 'Pusa, Bihar 2010-13: sugarcane + garlic (1:2) with the recommended fertilizer for both crops gave a land-equivalent ratio of 1.30; with four irrigations the ratio was 1.36.',
  },
  {
    id: 'ragi-pigeonpea-krishikosh', pair: 'finger-millet+pigeon-pea', figures: ['1.37'], status: 'verified', checkedOn: '2026-10-24',
    source: 'ragiPigeonpeaKrishikosh', locator: 'abstract',
    text: 'Maximum land-equivalent ratio (1.37) was obtained with transplanted finger millet + pigeonpea in 6:2 rows; pigeonpea yield was lower in the intercrop.',
  },
];

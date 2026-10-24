// companionPairs.js - the ONLY place a crop-pair recommendation is made.
//
// Every pair has a status, a plain-language summary, benefits, risks, conditions and the source ids
// (companionSources.js) its claims rest on. Nothing is recommended because "it appears in a companion
// planting list": WSU, UMN and ATTRA extension publications all caution that such lists overstate the
// evidence, and trials show effects depend on crop, cultivar, spacing, fertility, season and region.
//
// STATUS  supported    field research reports a benefit (conditions and risks listed with it)
//         potential    some evidence, but mixed, conditional, or only a few studies reviewed
//         unsuitable   a documented conflict (e.g. a shared disease or pest)
//         insufficient (the default, never stored here) no evidence found: neither recommended nor ruled out
//
// `b` is a catalog crop id, or { external: true, name, note } for a partner that is not a marketplace
// crop (azolla, ducks, fish, desmodium, marigold).
//
// REMOVED (see docs/COMPANION_EVIDENCE.md): onion-carrot, brinjal-beans, cabbage-dill, cotton-pulses,
// sugarcane-onion, cucumber-potato, onion/garlic "stunting" peas and beans, and others. No reliable
// source was found for them.

export const STATUS_META = {
  supported: { icon: '✅', label: 'Supported by research', tone: 'good' },
  potential: { icon: '🟡', label: 'Potentially suitable (mixed or limited evidence)', tone: 'maybe' },
  unsuitable: { icon: '⛔', label: 'Unsuitable (documented conflict)', tone: 'bad' },
  insufficient: { icon: '❔', label: 'Insufficient evidence', tone: 'unknown' },
};

const ext = (name, note) => ({ external: true, name, note });

export const PAIRS = [
  {
    a: 'wheat', b: 'chickpea', status: 'supported', consistency: 'consistent', region: 'South Asia (Bangladesh), Australia and North Africa (field studies); an Indian 2024 trial is also cited but its figures are not yet verified',
    summary: 'Wheat and chickpea grown together used land more efficiently than separate plots in independent field studies: the average land equivalent ratio was 1.23 across six experiments in Bangladesh, and an Australian trial found the mixes needed about 14% less land.',
    benefits: ['Land equivalent ratio above 1 in independent studies in three countries: the mix produced more per hectare than separate plots', 'Wheat-based intercropping is covered in a wheat intercropping literature review'],
    risks: ['In most of the Bangladesh trials each sole crop at the full seed rate out-yielded the same crop in the mixture: the gain comes from sharing land', 'Site-to-site variation was large'],
    conditions: ['Both are cool-season (rabi) crops in India', 'Results depend on row ratio, variety and fertility: confirm the local recommendation'],
    sources: ['wheatChickpeaBangladesh', 'wheatChickpeaGrdc', 'wheatChickpeaAlgeria', 'wheatChickpeaIjra', 'wheatIntercropReview'],
  },
  {
    a: 'wheat', b: 'mustard', status: 'supported', consistency: 'consistent', region: 'India (several field trials)',
    summary: 'Indian trials report a yield advantage for wheat + Indian mustard (land equivalent ratio above 1 in several studies), but mustard is the aggressive partner and the result depends strongly on the row ratio.',
    benefits: ['Extra oilseed income from the mustard rows', 'Land equivalent ratios above 1 in several trials'],
    risks: [
      'Mustard shades and out-competes wheat: tight ratios (for example 2 wheat : 1 mustard, or 2:2) lowered wheat yield or equivalent yield in trials',
      'In one row-ratio trial a particular mustard variety caused a drastic fall in wheat yield',
    ],
    conditions: [
      'The best ratio differed between studies (reported from about 5:1 to 10:2 wheat to mustard rows): use your state agricultural university recommendation',
      'In one study the advantage was largest at the full recommended fertilizer dose',
      'Winter (rabi) season, mostly irrigated in the studies reviewed',
    ],
    sources: ['wheatMustardIjas', 'wheatMustardFym', 'wheatIntercropReview', 'mustardWheatLentil', 'wheatChickpeaIjra', 'wheatMustardFrontiers'],
  },
  {
    a: 'chickpea', b: 'mustard', status: 'supported', consistency: 'consistent', region: 'India (field trials)',
    summary: 'Mustard + chickpea intercropping gave yield and land-use advantages in Indian trials (land equivalent ratio above 1 in the reported trials, including one in the Bundelkhand region).',
    benefits: ['Higher combined productivity than sole crops in the reported trials', 'Mustard adds oilseed income'],
    risks: ['Mustard is the more competitive crop and can suppress chickpea if its share is too high'],
    conditions: ['Row ratio and nutrient management changed the results: follow the local recommendation', 'Winter (rabi) season'],
    sources: ['chickpeaMustardIjas', 'mustardBundelkhand'],
  },
  {
    a: 'pigeon-pea', b: 'sorghum', status: 'supported', consistency: 'consistent', region: 'India (rainfed trials)',
    summary: 'A long-studied rainfed intercrop: ICAR-IIMR trials report higher sorghum-equivalent yield than sole sorghum, but competition is real and pigeonpea yield can fall sharply.',
    benefits: ['Higher combined (sorghum-equivalent) yield than sole sorghum in ICAR-IIMR trials'],
    risks: ['Sorghum is very competitive: pigeonpea grain yield fell sharply in one comparison (the exact loss is not yet verified)', 'Competition was severe at some row arrangements'],
    conditions: ['Rainfed conditions; row ratio and variety choice matter'],
    sources: ['sorghumPigeonpeaIimr', 'pigeonpeaBreedingPmc', 'pigeonpeaCompetition', 'pigeonpeaSorghumExpAgric'],
  },
  {
    a: 'pigeon-pea', b: 'groundnut', status: 'potential', consistency: 'consistent', region: 'India (limited studies reviewed)',
    summary: 'A land-configuration study reported a yield advantage for pigeonpea with groundnut as the intercrop. Only a small number of studies were reviewed.',
    benefits: ['Land equivalent ratio above 1 reported for groundnut as the intercrop'],
    risks: ['The evidence base reviewed is small; the effect depends on row arrangement'],
    conditions: ['Rainfed pigeonpea systems'],
    sources: ['pigeonpeaEquivalent'],
  },
  {
    a: 'pigeon-pea', b: 'soybean', status: 'potential', consistency: 'mixed', region: 'India (mixed results)',
    summary: 'Results are mixed: one study found a 1:5 pigeonpea:soybean arrangement best, while a land-configuration trial found soybean did not outperform sole pigeonpea.',
    benefits: ['A 1:5 arrangement performed best in an organic-management study'],
    risks: ['Another trial found no advantage over sole pigeonpea'],
    conditions: ['Arrangement, variety and management decide the outcome'],
    sources: ['pigeonpeaLegumeRes', 'pigeonpeaEquivalent'],
  },
  {
    a: 'maize', b: 'soybean', status: 'supported', consistency: 'consistent', region: 'Global (meta-analysis) and field trials',
    summary: 'A meta-analysis of maize-soybean intercropping found better land and fertilizer-nitrogen use efficiency than sole crops (average land equivalent ratio about 1.32).',
    benefits: ['More output per hectare than separate crops on average', 'Better use of fertilizer nitrogen'],
    risks: ['Soybean is shaded by maize and usually yields less than a sole crop', 'Row ratio changes the result'],
    conditions: ['Strip and relay ratios were studied; adapt to local machinery and varieties'],
    sources: ['maizeSoybeanMeta', 'maizeSoybeanRowRatio', 'maizeSoybeanRelayPmc'],
  },
  {
    a: 'maize', b: 'beans', status: 'potential', consistency: 'mixed', region: 'Mixed evidence',
    summary: 'Studies of maize with common bean report positive intercropping indices in several places, but a two-year white-bean study found lower yields in intercropped systems than in sole crops.',
    benefits: ['Positive land-use indices reported in recent common-bean studies (Ethiopia and others)'],
    risks: ['In one two-year study intercropped yields were lower than sole crops', 'Beans suffer from maize shade; sowing technique and fertilization change the result'],
    conditions: ['The result depends on variety, spacing, sowing technique and fertility'],
    sources: ['maizeBeanFrontiers', 'maizeBeanLegumeSci', 'maizeBeanEthiopia', 'maizeWhiteBean'],
  },
  {
    a: 'maize', b: ext('Desmodium (silverleaf desmodium, a fodder legume) with a Napier grass border', 'Two companion plants: the "push-pull" system'),
    status: 'supported', consistency: 'consistent', region: 'East Africa (Kenya, Ethiopia): not an Indian trial',
    summary: "In the 'push-pull' system, desmodium between maize rows and Napier grass around the field controlled stemborers and Striga weed and was profitable for smallholders in Kenya and Ethiopia.",
    benefits: ['Reduced stemborer damage and Striga weed in on-farm trials', 'Positive economic returns reported for smallholders', 'Desmodium also provides fodder'],
    risks: ['The evidence is from East Africa; the sources reviewed do not include Indian field trials'],
    conditions: ['Needs both desmodium and a Napier grass border; the pests targeted are African stemborers and Striga'],
    sources: ['pushPullIcipe', 'pushPullEconomics', 'pushPullEthiopia'],
  },
  {
    a: 'maize', b: 'tomato', status: 'unsuitable', consistency: 'consistent', kind: 'conflict', region: 'USA extension (the pest species differs in India)',
    summary: 'Corn earworm and tomato fruitworm are the same insect (Helicoverpa zea). Extension advice is to avoid planting tomatoes near corn that is silking or drying, because moths move onto tomato.',
    benefits: [],
    risks: ['Shared pest: fruit damage on tomato when moths leave maturing corn', 'Corn can instead act as a trap crop while silking (University of Illinois), so the risk depends on timing'],
    conditions: ['The sources describe Helicoverpa zea in the Americas; the tomato fruit borer in India is a related species, and no Indian source on this exact pair was reviewed'],
    sources: ['earwormUsu', 'earwormIllinois', 'earwormMissouri'],
  },
  {
    a: 'rice', b: ext('Azolla (floating nitrogen-fixing fern)', 'Grown in the flooded paddy'),
    status: 'potential', consistency: 'consistent', region: 'Asia (reviews and field studies, incl. southern China)',
    summary: "Azolla grown in flooded rice can supply part of the crop's nitrogen. In double-rice trials in southern China azolla reduced the nitrogen fertilizer needed; reviews describe it as a biofertilizer for lowland rice.",
    benefits: ['Supplies nitrogen through its symbiotic cyanobacterium and lowers fertilizer-N needs', 'A southern China study reported lower methane emission with azolla'],
    risks: ['Azolla supplements fertilizer rather than replacing it entirely in the studies reviewed', 'Performance depends on management, water and temperature'],
    conditions: ['Flooded (lowland) paddy only'],
    sources: ['azollaOverviewPmc', 'azollaDoubleRice', 'azollaAssessment'],
  },
  {
    a: 'rice', b: ext('Ducks (rice-duck farming)', 'Ducks roam the paddy after transplanting'),
    status: 'supported', consistency: 'consistent', region: 'Asia (field experiments)',
    summary: 'Rice-duck farming strongly reduced weed density and the weed seed bank in field experiments. Insect-pest effects are inconsistent and should not be promised.',
    benefits: ['Large reductions in weed density and weed seed bank reported', 'Soil fertility effects were reported in a rice-duck study'],
    risks: ['Insect-pest control is inconsistent: a 2022 study reported planthopper and leafhopper numbers increased and predator interactions changed'],
    conditions: ['Flooded rice; the results come from experiments in Asia'],
    sources: ['riceDuckWeeds', 'riceDuckSoil', 'riceDuckBiocontrol', 'riceDucklings'],
  },
  {
    a: 'rice', b: ext('Fish (rice-fish farming)', 'Fish live in the flooded paddy'),
    status: 'potential', consistency: 'consistent', region: 'India (one review; no field trial in the sources)',
    summary: 'Integrated rice-fish farming is documented in a review of Indian systems as a way to produce more food from the same flooded land.',
    benefits: ['Additional protein and income from the same field, per the Indian review'],
    risks: ['See the review for management requirements: fish need suitable water depth and pesticide management'],
    conditions: ['Flooded (lowland) rice with reliable water'],
    sources: ['riceFishIndia'],
  },
  {
    a: 'tomato', b: ext('French or African marigold (Tagetes)', 'Used as a cover or rotation crop, or planted among tomatoes'),
    status: 'potential', consistency: 'mixed', region: 'Field studies (USA, China) and reviews',
    summary: 'Marigolds can suppress root-knot nematodes, which attack tomato. The effect is strongest when marigold is grown as a rotation or cover crop and differs by marigold species and cultivar.',
    benefits: ['Lower root-knot nematode populations and better tomato and melon yields reported with selected marigold cultivars', 'Rotation and intercropping with marigold controlled root-knot nematodes in another crop (angelica)'],
    risks: ['Only useful if root-knot nematodes are your problem', 'The effect varies a lot between marigold species and cultivars'],
    conditions: ['Evidence is strongest for marigold grown before the crop; as an intercrop the evidence is more limited'],
    sources: ['marigoldPlantDisease', 'marigoldReview', 'marigoldAngelica'],
  },
  {
    a: 'tomato', b: 'potato', status: 'unsuitable', consistency: 'consistent', kind: 'conflict', region: 'Extension (USA); the same pathogen occurs worldwide',
    summary: 'Tomato and potato share late blight (Phytophthora infestans), so growing them side by side or in succession raises disease risk. Both are in the nightshade family.',
    benefits: [],
    risks: ['Blight can spread between the two crops and from volunteer potatoes to tomatoes', 'Succession planting carries over disease'],
    conditions: ['Risk is highest in cool, wet weather'],
    sources: ['blightNdsu', 'blightUmass', 'blightExtension', 'blightUw'],
  },
];

// Rules that apply to every crop. They are PRINCIPLES, not pair claims, and are labelled that way.
export const GENERAL_PRINCIPLES = {
  caution: {
    title: 'Check the evidence before copying a companion-planting list',
    text: 'Extension publications (WSU, University of Minnesota, ATTRA) caution that many popular companion-planting claims have limited or inconsistent scientific support. Effects depend on the crops, varieties, spacing, fertility, season and region.',
    sources: ['extWsu', 'extUmn', 'extAttra'],
    strength: 'extension guidance',
  },
  legume: {
    title: 'Legumes can add nitrogen for cereals',
    text: 'In maize-soybean intercropping, a meta-analysis found better fertilizer-nitrogen efficiency than sole crops. A legume partner or a preceding legume is a reasonable thing to try for a cereal, within what local advice recommends.',
    sources: ['maizeSoybeanMeta', 'maizeSoybeanRelayPmc'],
    strength: 'research for maize-soybean; a general principle for other cereals',
  },
  family: {
    title: 'Rotate away from relatives',
    text: 'Crops in the same botanical family tend to share pests and diseases (tomato and potato share late blight). Avoid growing relatives back to back or side by side, and rotate with a different family.',
    sources: ['blightNdsu', 'blightUmass', 'rotationSalisbury'],
    strength: 'extension evidence for the tomato-potato example; a general principle otherwise (the broader rotation sources found were secondary)',
  },
};

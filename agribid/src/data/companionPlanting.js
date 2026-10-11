// companionPlanting.js - data + helpers for the Companion Planting tab.
//
// HOW TO ADD A CROP: append one object to CROPS (see the shape below).
// Nothing else needs to change - search, filters, cards, the pair-checker and
// the field-layout picture are all generated from this array, and
// companionPlanting.test.js fails if an entry is malformed.
//
// HONESTY NOTE (keep this when editing): this is general guidance, not
// farm-specific advice. Each crop carries an `evidence` label:
//   'research'    - the pairing is described in published intercropping
//                   trials / agricultural-research-institute material
//                   (e.g. wheat + chickpea, wheat + mustard, rice-fish-azolla,
//                   pigeonpea + sorghum/soybean/groundnut, chickpea + mustard).
//   'traditional' - long-standing companion-planting practice (mostly from
//                   vegetable gardening); widely repeated but not all
//                   field-trial tested, and results vary by soil/climate.
// Row ratios in `layout` are ILLUSTRATIVE; optimal ratios vary by region and
// variety, so farmers should confirm with their local KVK / extension officer.
// Pairings only appear when we could support them: an empty `foes` list
// means "no widely documented conflict", NOT "guaranteed safe".

export const BENEFITS = {
  nitrogen: { icon: '🌱', label: 'Adds nitrogen' },
  pest: { icon: '🐛', label: 'Pest control' },
  income: { icon: '💰', label: 'Extra income' },
  weed: { icon: '🌿', label: 'Weed control' },
  support: { icon: '🪜', label: 'Natural support' },
  space: { icon: '📐', label: 'Saves space' },
  helpers: { icon: '🐝', label: 'Attracts helpers' },
  soil: { icon: '🪱', label: 'Soil health' },
};

export const EVIDENCE = {
  research: { icon: '🔬', label: 'Backed by field trials' },
  traditional: { icon: '🌾', label: 'Traditional practice' },
};

export const CATEGORY_META = {
  Grains: { icon: '🌾', from: '#fef3c7', to: '#f59e0b' },
  Vegetables: { icon: '🥕', from: '#dcfce7', to: '#22c55e' },
  Fruits: { icon: '🍊', from: '#ffedd5', to: '#f97316' },
};

// One place for every emoji used for companions (picture-first UI).
const EMOJI = {
  Basil: '🌿', Marigold: '🌼', Onion: '🧅', Garlic: '🧄', Carrot: '🥕', Radish: '🌱', Beetroot: '🟣', Lettuce: '🥬',
  Beans: '🫘', Cowpea: '🫘', 'Green Gram': '🫘', 'Black Gram': '🫘', Chickpea: '🫘', 'Pigeon Pea': '🫘', Soybean: '🌱',
  Groundnut: '🥜', Maize: '🌽', Pumpkin: '🎃', Mustard: '🌼', Wheat: '🌾', Sorghum: '🌾', Safflower: '🌻', Sunflower: '🌻',
  Azolla: '🌿', Fish: '🐟', Ducks: '🦆', Potato: '🥔', Tomato: '🍅', Cabbage: '🥬', Cucumber: '🥒', Peas: '🫛', Spinach: '🥬',
  Brinjal: '🍆', Okra: '🫛', Chilli: '🌶️', Dill: '🌿', Fennel: '🌿', Parsnip: '🥕', Coriander: '🌿', Turmeric: '🟡',
  Ginger: '🫚', Clover: '☘️', 'Sweet Potato': '🍠', Legumes: '🫘', 'Heavy climbers': '🌿', 'Tall shading crops': '🌳',
  'Dense banana planting': '🍌', Cotton: '🌿', Lentil: '🫘', Potatoes: '🥔', Cauliflower: '🥦', Sugarcane: '🎋',
};
export const emojiFor = (name) => EMOJI[name] || '🌱';

const f = (name, why, benefit) => ({ name, emoji: emojiFor(name), why, benefit });
const x = (name, why) => ({ name, emoji: emojiFor(name), why });

// shape: { id, name, aliases[], category, emoji, season, evidence, tip,
//          friends[{name,emoji,why,benefit}], foes[{name,emoji,why}],
//          next?: string[],               // good crop to grow AFTER this one
//          layout?: {type:'rows'|'layers', caption, pattern[]} }
//   rows pattern entries:   'main' or a friend index (0,1,2...)
//   layers pattern entries: { emoji, label }
export const CROPS = [
  // ------------------------------------------------------------------ GRAINS
  {
    id: 'wheat', name: 'Wheat', aliases: ['gehu', 'gehun'], category: 'Grains', emoji: '🌾', season: 'Rabi (winter)', evidence: 'research',
    friends: [
      f('Chickpea', 'Wheat + chickpea intercropping has given good combined returns in field trials; the legume adds nitrogen.', 'nitrogen'),
      f('Mustard', 'A few mustard rows add oilseed income. Keep them wide apart - close rows shade the wheat.', 'income'),
    ],
    foes: [],
    tip: 'With mustard, use only 1 mustard row per 5-9 wheat rows; closer ratios cut wheat yield in trials.',
    layout: { type: 'rows', caption: 'Wheat + chickpea in alternating strips (illustrative 4 : 2 rows)', pattern: ['main', 'main', 'main', 'main', 0, 0, 'main', 'main', 'main', 'main', 0, 0] },
  },
  {
    id: 'rice', name: 'Rice', aliases: ['paddy', 'chawal'], category: 'Grains', emoji: '🍚', season: 'Kharif (monsoon)', evidence: 'research',
    friends: [
      f('Azolla', 'A floating fern that fixes nitrogen, suppresses weeds and can feed fish and ducks.', 'nitrogen'),
      f('Fish', 'In integrated rice-fish fields, fish eat insects and weeds and their waste feeds the crop.', 'pest'),
      f('Ducks', 'Ducks eat pests and weeds in the paddy and add manure (rice-duck farming).', 'pest'),
    ],
    foes: [],
    next: ['Chickpea', 'Lentil', 'Green Gram'],
    tip: 'Fish and ducks need a pesticide-free paddy and enough water depth. Pulses grown after rice (rice fallows) can reduce the next crop\'s nitrogen need.',
    layout: {
      type: 'layers', caption: 'Rice-fish-azolla-duck system (side view, illustrative)',
      pattern: [{ emoji: '🦆', label: 'Ducks roam the field' }, { emoji: '🌾', label: 'Rice plants' }, { emoji: '🌿', label: 'Azolla on the water' }, { emoji: '🐟', label: 'Fish underwater' }],
    },
  },
  {
    id: 'maize', name: 'Maize', aliases: ['corn', 'makka'], category: 'Grains', emoji: '🌽', season: 'Kharif / summer', evidence: 'traditional',
    friends: [
      f('Beans', 'Climb the maize stalks and add nitrogen (the "Three Sisters" tradition).', 'support'),
      f('Pumpkin', 'Big leaves shade the soil and keep weeds down.', 'weed'),
      f('Cowpea', 'A legume that adds nitrogen between the maize rows.', 'nitrogen'),
    ],
    foes: [x('Tomato', 'Maize earworm and tomato fruitworm are the same pest, so they build up together.')],
    tip: 'Sow climbing beans only after the maize is established, or they will smother it.',
    layout: { type: 'rows', caption: 'Three Sisters style rows (illustrative)', pattern: ['main', 0, 1, 'main', 0, 1, 'main', 0, 1] },
  },
  {
    id: 'chickpea', name: 'Chickpea', aliases: ['chana', 'gram', 'bengal gram'], category: 'Grains', emoji: '🫘', season: 'Rabi (winter)', evidence: 'research',
    friends: [
      f('Mustard', 'Chickpea + mustard (for example 4 : 1 rows) beat either crop alone in several Indian trials.', 'income'),
      f('Wheat', 'Chickpea strips between wheat rows are a documented wheat intercrop.', 'income'),
      f('Safflower', 'Chickpea + safflower is recommended by Indian dryland research (3 : 1 or 4 : 2 rows).', 'income'),
    ],
    foes: [],
    tip: 'Ratios differ by region - treat 4 : 1 chickpea : mustard as a starting point and ask your KVK.',
    layout: { type: 'rows', caption: 'Chickpea + mustard (illustrative 4 : 1 rows)', pattern: ['main', 'main', 'main', 'main', 0, 'main', 'main', 'main', 'main', 0] },
  },
  {
    id: 'mustard', name: 'Mustard', aliases: ['sarson', 'rapeseed'], category: 'Grains', emoji: '🌼', season: 'Rabi (winter)', evidence: 'research',
    friends: [
      f('Chickpea', 'A legume partner; mustard + chickpea showed an intercropping advantage in trials.', 'nitrogen'),
      f('Wheat', 'Mustard in wide rows inside wheat gave strong returns in trials.', 'income'),
    ],
    foes: [],
    tip: 'Mustard is the more aggressive crop - give its partner enough rows so it is not crowded out.',
    layout: { type: 'rows', caption: 'Mustard rows inside wheat (illustrative 1 : 5)', pattern: [0, 0, 0, 0, 0, 'main', 0, 0, 0, 0, 0, 'main'] },
  },
  {
    id: 'pigeon-pea', name: 'Pigeon Pea', aliases: ['toor', 'tur', 'arhar', 'toor dal'], category: 'Grains', emoji: '🫘', season: 'Kharif', evidence: 'research',
    friends: [
      f('Sorghum', 'Pigeon pea + sorghum is one of India\'s classic rainfed intercrops.', 'space'),
      f('Soybean', 'Quick soybean is harvested before slow-starting pigeon pea needs the space.', 'income'),
      f('Groundnut', 'Groundnut fills the gap while pigeon pea grows slowly at first.', 'income'),
    ],
    foes: [],
    tip: 'Pigeon pea starts slowly - pair it with a short-duration crop that is harvested before it fills out.',
    layout: { type: 'rows', caption: 'Pigeon pea + sorghum (illustrative 1 : 2 rows)', pattern: ['main', 0, 0, 'main', 0, 0, 'main', 0, 0] },
  },
  {
    id: 'soybean', name: 'Soybean', aliases: ['soya'], category: 'Grains', emoji: '🌱', season: 'Kharif', evidence: 'research',
    friends: [
      f('Pigeon Pea', 'A standard soybean + pigeon pea intercrop in Indian rainfed farming.', 'income'),
      f('Maize', 'Soybean rows between maize rows are a documented intercrop.', 'nitrogen'),
      f('Cotton', 'Soybean is used as a short intercrop in young cotton.', 'income'),
    ],
    foes: [],
    tip: 'Choose a short-duration soybean variety when it is grown under a slow-starting partner.',
  },
  {
    id: 'groundnut', name: 'Groundnut', aliases: ['peanut', 'moongphali'], category: 'Grains', emoji: '🥜', season: 'Kharif / summer', evidence: 'research',
    friends: [
      f('Pigeon Pea', 'Groundnut + pigeon pea (for example 5 : 1 rows) is a widely used Indian combination.', 'income'),
    ],
    foes: [],
    tip: 'Keep the pigeon pea rows few so groundnut still gets enough light.',
    layout: { type: 'rows', caption: 'Groundnut + pigeon pea (illustrative 5 : 1 rows)', pattern: ['main', 'main', 'main', 'main', 'main', 0, 'main', 'main', 'main', 'main', 'main', 0] },
  },
  {
    id: 'sorghum', name: 'Sorghum', aliases: ['jowar'], category: 'Grains', emoji: '🌾', season: 'Kharif / rabi', evidence: 'research',
    friends: [
      f('Pigeon Pea', 'A classic rainfed pairing in India (about 2 : 1 sorghum : pigeon pea).', 'income'),
      f('Chickpea', 'Rabi sorghum + chickpea in 2 : 1 rows is recommended by Indian dryland research.', 'nitrogen'),
    ],
    foes: [],
    tip: 'Ask your KVK for the row ratio that suits your rainfall and soil.',
    layout: { type: 'rows', caption: 'Sorghum + chickpea (illustrative 2 : 1 rows)', pattern: ['main', 'main', 0, 'main', 'main', 0, 'main', 'main', 0] },
  },
  {
    id: 'cotton', name: 'Cotton', aliases: ['kapas'], category: 'Grains', emoji: '🌿', season: 'Kharif / summer', evidence: 'research',
    friends: [
      f('Green Gram', 'A short legume intercrop that is harvested before cotton needs the space.', 'nitrogen'),
      f('Black Gram', 'Another short-duration pulse commonly grown between young cotton rows.', 'nitrogen'),
      f('Cowpea', 'A legume that fixes nitrogen and covers the soil early on.', 'nitrogen'),
    ],
    foes: [],
    tip: 'Pick short-duration pulses and harvest them early so they do not compete with the cotton.',
    layout: { type: 'rows', caption: 'Cotton + green gram (illustrative 1 : 1 rows)', pattern: ['main', 0, 'main', 0, 'main', 0] },
  },
  {
    id: 'sugarcane', name: 'Sugarcane', aliases: ['ganna', 'cane'], category: 'Grains', emoji: '🎋', season: 'Year-round', evidence: 'research',
    friends: [
      f('Onion', 'A short-duration crop harvested while the cane canopy is still open.', 'income'),
      f('Garlic', 'Another quick intercrop for the first months of cane growth.', 'income'),
      f('Potato', 'Grown between rows of autumn-planted cane and harvested early.', 'income'),
      f('Mustard', 'Autumn-planted cane is often intercropped with mustard.', 'income'),
    ],
    foes: [],
    tip: 'Intercrop only in the early months, while the cane canopy is still open.',
  },
  // --------------------------------------------------------------- VEGETABLES
  {
    id: 'tomato', name: 'Tomato', aliases: ['tamatar'], category: 'Vegetables', emoji: '🍅', season: 'Warm season', evidence: 'traditional',
    friends: [
      f('Basil', 'Its strong scent is said to confuse pests and it shares the same watering.', 'pest'),
      f('Marigold', 'Marigold roots are used to deter soil nematodes.', 'pest'),
      f('Onion', 'Strong-smelling alliums are traditionally used to discourage pests.', 'pest'),
    ],
    foes: [x('Potato', 'Both get blight, so planting them together spreads it.'), x('Cabbage', 'Cabbage family is said to compete with and stunt tomatoes.'), x('Maize', 'They share the same fruitworm.')],
    tip: 'Space plants and prune the lower leaves for airflow - it reduces fungal disease.',
    layout: { type: 'rows', caption: 'Tomato with marigold border (illustrative)', pattern: [0, 'main', 'main', 'main', 0, 'main', 'main', 'main', 0] },
  },
  {
    id: 'onion', name: 'Onion', aliases: ['pyaz', 'pyaaz'], category: 'Vegetables', emoji: '🧅', season: 'Winter (rabi)', evidence: 'traditional',
    friends: [
      f('Carrot', 'The onion smell is said to confuse carrot fly; the shallow and deep roots share space well.', 'pest'),
      f('Beetroot', 'A compact root crop that fits between onion rows.', 'space'),
      f('Lettuce', 'Quick-growing and shallow-rooted, it uses the gaps.', 'space'),
    ],
    foes: [x('Beans', 'Alliums are said to stunt beans and peas.'), x('Peas', 'Alliums are said to stunt beans and peas.')],
    tip: 'Alternate rows of onion and carrot so harvesting stays easy.',
    layout: { type: 'rows', caption: 'Onion + carrot alternating rows (illustrative)', pattern: ['main', 0, 'main', 0, 'main', 0] },
  },
  {
    id: 'carrot', name: 'Carrot', aliases: ['gajar'], category: 'Vegetables', emoji: '🥕', season: 'Winter (rabi)', evidence: 'traditional',
    friends: [
      f('Onion', 'Onion smell is said to hide carrots from carrot fly.', 'pest'),
      f('Radish', 'Quick radish marks the row and loosens soil before carrots need it.', 'space'),
      f('Peas', 'Peas add nitrogen and carrots use the soil below them.', 'nitrogen'),
    ],
    foes: [x('Dill', 'Dill is said to stunt carrots and can cross with them.'), x('Parsnip', 'Same family: shared pests and diseases.')],
    tip: 'Use loose, stone-free soil for straight roots.',
    layout: { type: 'rows', caption: 'Carrot + onion alternating rows (illustrative)', pattern: ['main', 0, 'main', 0, 'main', 0] },
  },
  {
    id: 'potato', name: 'Potato', aliases: ['aloo', 'alu'], category: 'Vegetables', emoji: '🥔', season: 'Winter', evidence: 'traditional',
    friends: [
      f('Beans', 'Beans add nitrogen and are said to deter Colorado beetle.', 'nitrogen'),
      f('Cabbage', 'A different family with different pests, so they sit well together.', 'space'),
      f('Maize', 'Tall maize gives light shade and a different root zone.', 'space'),
    ],
    foes: [x('Tomato', 'Shared blight - never plant them side by side.'), x('Cucumber', 'Said to make potatoes more prone to blight.')],
    tip: 'Rotate potato away from tomato beds from one season to the next.',
  },
  {
    id: 'beans', name: 'Beans', aliases: ['french beans', 'pole beans', 'sem'], category: 'Vegetables', emoji: '🫘', season: 'Warm season', evidence: 'traditional',
    friends: [
      f('Maize', 'Beans climb the maize and add nitrogen in return.', 'support'),
      f('Carrot', 'Different root depth; they do not compete.', 'space'),
      f('Cucumber', 'Beans fix nitrogen that the hungry cucumber uses.', 'nitrogen'),
    ],
    foes: [x('Onion', 'Alliums are said to stunt beans.'), x('Garlic', 'Alliums are said to stunt beans.')],
    tip: 'Do not over-fertilise with nitrogen when beans are intercropped.',
  },
  {
    id: 'cabbage', name: 'Cabbage', aliases: ['patta gobi', 'band gobi'], category: 'Vegetables', emoji: '🥬', season: 'Winter', evidence: 'traditional',
    friends: [
      f('Onion', 'Strong smell is said to put cabbage moths off.', 'pest'),
      f('Dill', 'Dill flowers attract wasps and hoverflies that eat cabbage pests.', 'helpers'),
      f('Marigold', 'A flowering border that helps bring in beneficial insects.', 'helpers'),
    ],
    foes: [x('Tomato', 'Said to stunt each other.')],
    tip: 'Do not plant cabbage where cabbage or cauliflower grew last season.',
  },
  {
    id: 'cauliflower', name: 'Cauliflower', aliases: ['gobi', 'phool gobi'], category: 'Vegetables', emoji: '🥦', season: 'Winter', evidence: 'traditional',
    friends: [
      f('Onion', 'Strong smell is said to put brassica pests off.', 'pest'),
      f('Dill', 'Attracts predator insects that eat caterpillars and aphids.', 'helpers'),
      f('Marigold', 'A flowering border that helps bring in beneficial insects.', 'helpers'),
    ],
    foes: [x('Tomato', 'Said to stunt each other.')],
    tip: 'Rotate away from other brassicas to avoid clubroot and shared pests.',
  },
  {
    id: 'brinjal', name: 'Brinjal', aliases: ['eggplant', 'baingan', 'aubergine'], category: 'Vegetables', emoji: '🍆', season: 'Warm season', evidence: 'traditional',
    friends: [
      f('Beans', 'Beans add nitrogen between brinjal plants.', 'nitrogen'),
      f('Marigold', 'Marigold borders are traditionally used to deter nematodes.', 'pest'),
      f('Spinach', 'A quick low crop that covers the soil between plants.', 'weed'),
    ],
    foes: [x('Fennel', 'Fennel is said to inhibit neighbouring vegetables.')],
    tip: 'Mulch around plants to hold moisture and keep soil temperatures even.',
  },
  {
    id: 'okra', name: 'Okra', aliases: ['bhindi', 'ladies finger'], category: 'Vegetables', emoji: '🫛', season: 'Summer / kharif', evidence: 'traditional',
    friends: [
      f('Cucumber', 'Okra gives light shade and cucumber covers the soil.', 'space'),
      f('Chilli', 'A common warm-season pairing in mixed vegetable plots.', 'space'),
      f('Basil', 'Aromatic herb said to deter pests.', 'pest'),
    ],
    foes: [],
    tip: 'Keep rows spaced - okra grows tall and shades small plants.',
  },
  {
    id: 'chilli', name: 'Chilli', aliases: ['green chilli', 'mirch', 'capsicum'], category: 'Vegetables', emoji: '🌶️', season: 'Warm season', evidence: 'traditional',
    friends: [
      f('Basil', 'Aromatic herb said to deter aphids and whitefly.', 'pest'),
      f('Onion', 'Alliums are traditionally used to discourage pests.', 'pest'),
      f('Carrot', 'Different root depth, so they share a bed easily.', 'space'),
      f('Marigold', 'Used as a border to attract helpful insects.', 'helpers'),
    ],
    foes: [x('Fennel', 'Fennel is said to inhibit neighbouring vegetables.')],
    tip: 'Water at the base - wet leaves invite fungal disease.',
  },
  {
    id: 'cucumber', name: 'Cucumber', aliases: ['kheera', 'kakdi'], category: 'Vegetables', emoji: '🥒', season: 'Summer', evidence: 'traditional',
    friends: [
      f('Beans', 'Beans add nitrogen that cucumber uses.', 'nitrogen'),
      f('Peas', 'Peas add nitrogen early in the season.', 'nitrogen'),
      f('Radish', 'Said to deter cucumber beetles.', 'pest'),
      f('Sunflower', 'Tall sunflowers give light shade and attract pollinators.', 'helpers'),
    ],
    foes: [x('Potato', 'Said to make potatoes more prone to blight.')],
    tip: 'Train vines upward on a trellis to save space and reduce rot.',
  },
  {
    id: 'peas', name: 'Peas', aliases: ['matar', 'green peas'], category: 'Vegetables', emoji: '🫛', season: 'Winter (rabi)', evidence: 'traditional',
    friends: [
      f('Carrot', 'Peas add nitrogen; carrots use the soil below them.', 'nitrogen'),
      f('Radish', 'Quick crop that marks the rows.', 'space'),
      f('Cucumber', 'Cucumber uses the nitrogen peas add.', 'nitrogen'),
      f('Maize', 'Maize can be used as natural support for climbing peas.', 'support'),
    ],
    foes: [x('Onion', 'Alliums are said to stunt peas.'), x('Garlic', 'Alliums are said to stunt peas.')],
    tip: 'Give climbing types a trellis or maize stalks to grow on.',
  },
  {
    id: 'garlic', name: 'Garlic', aliases: ['lahsun', 'lehsun'], category: 'Vegetables', emoji: '🧄', season: 'Winter (rabi)', evidence: 'traditional',
    friends: [
      f('Tomato', 'Strong smell is traditionally used to keep spider mites away.', 'pest'),
      f('Carrot', 'Said to help keep carrot fly away.', 'pest'),
      f('Cabbage', 'Said to deter cabbage pests.', 'pest'),
    ],
    foes: [x('Peas', 'Alliums are said to stunt peas.'), x('Beans', 'Alliums are said to stunt beans.')],
    tip: 'Plant garlic along the edges of beds as a pest-deterrent border.',
  },
  {
    id: 'spinach', name: 'Spinach', aliases: ['palak'], category: 'Vegetables', emoji: '🥬', season: 'Winter', evidence: 'traditional',
    friends: [
      f('Peas', 'Peas give light shade and add nitrogen.', 'nitrogen'),
      f('Radish', 'Quick radish uses gaps without competing.', 'space'),
      f('Cabbage', 'Low spinach grows under taller cabbage.', 'space'),
    ],
    foes: [],
    tip: 'Spinach bolts in heat - partial shade from taller crops helps.',
  },
  {
    id: 'radish', name: 'Radish', aliases: ['mooli'], category: 'Vegetables', emoji: '🌱', season: 'Winter', evidence: 'traditional',
    friends: [
      f('Carrot', 'Quick radish marks the slow carrot rows.', 'space'),
      f('Cucumber', 'Said to deter cucumber beetles.', 'pest'),
      f('Peas', 'Fast crop that fits between pea rows.', 'space'),
      f('Spinach', 'Fits between spinach plants without competing.', 'space'),
    ],
    foes: [],
    tip: 'Radish is ready in about a month - sow it between slower crops.',
  },
  // -------------------------------------------------------------------- FRUITS
  {
    id: 'mango', name: 'Mango', aliases: ['aam'], category: 'Fruits', emoji: '🥭', season: 'Summer', evidence: 'traditional',
    friends: [
      f('Turmeric', 'Shade-tolerant spice that earns income under young trees.', 'income'),
      f('Ginger', 'Shade-tolerant spice that earns income under young trees.', 'income'),
      f('Pigeon Pea', 'A legume that adds nitrogen while the trees are small.', 'nitrogen'),
    ],
    foes: [x('Tall shading crops', 'Tall crops shade young mango trees and compete for light.')],
    tip: 'Keep understory crops low and clear of the tree base, especially in young orchards.',
  },
  {
    id: 'banana', name: 'Banana', aliases: ['kela'], category: 'Fruits', emoji: '🍌', season: 'Year-round', evidence: 'traditional',
    friends: [
      f('Coriander', 'A quick low crop for the gaps between plants.', 'income'),
      f('Spinach', 'A quick low leafy crop for the gaps.', 'income'),
      f('Beans', 'A legume that adds nitrogen between banana rows.', 'nitrogen'),
    ],
    foes: [],
    tip: 'Keep wide spacing and steady moisture; banana is a heavy feeder.',
  },
  {
    id: 'citrus', name: 'Citrus', aliases: ['orange', 'lemon', 'mosambi', 'sweet lime', 'nimbu'], category: 'Fruits', emoji: '🍊', season: 'Spring / summer', evidence: 'traditional',
    friends: [
      f('Cowpea', 'A legume ground cover that adds nitrogen in young orchards.', 'nitrogen'),
      f('Green Gram', 'A short legume that is harvested before it shades young trees.', 'nitrogen'),
      f('Marigold', 'A flowering border that attracts helpful insects.', 'helpers'),
    ],
    foes: [x('Heavy climbers', 'Vigorous climbers smother the canopy.')],
    tip: 'Use low companions so roots and canopy do not compete.',
  },
  {
    id: 'grapes', name: 'Grapes', aliases: ['angur'], category: 'Fruits', emoji: '🍇', season: 'Summer', evidence: 'traditional',
    friends: [
      f('Garlic', 'Garlic and chives are traditionally grown along vine rows as a pest deterrent.', 'pest'),
      f('Clover', 'A low cover crop that adds nitrogen and protects soil.', 'soil'),
      f('Marigold', 'A flowering border that attracts helpful insects.', 'helpers'),
    ],
    foes: [],
    tip: 'Prune regularly and keep companions away from the vine base.',
  },
  {
    id: 'papaya', name: 'Papaya', aliases: ['papita'], category: 'Fruits', emoji: '🍈', season: 'Warm season', evidence: 'traditional',
    friends: [
      f('Marigold', 'A flowering border that helps deter soil pests.', 'pest'),
      f('Sweet Potato', 'A ground cover that keeps weeds down.', 'weed'),
      f('Beans', 'A legume that adds nitrogen around the plants.', 'nitrogen'),
    ],
    foes: [x('Dense banana planting', 'Crowding cuts the sunlight papaya needs.')],
    tip: 'Avoid waterlogging and give each plant plenty of sunlight.',
  },
];

export const CATEGORIES = ['All Crops', ...new Set(CROPS.map((c) => c.category))];

const norm = (s) => String(s || '').trim().toLowerCase();

// Search matches the crop name, its local-language aliases AND its companions,
// so typing "marigold" lists every crop that benefits from marigold.
export function matchesQuery(crop, query) {
  const q = norm(query);
  if (!q) return true;
  const haystack = [crop.name, ...(crop.aliases || []), ...crop.friends.map((c) => c.name), ...crop.foes.map((c) => c.name)];
  return haystack.some((h) => norm(h).includes(q));
}

export function filterCrops({ query = '', category = 'All Crops', crops = CROPS } = {}) {
  return crops.filter((c) => (category === 'All Crops' || c.category === category) && matchesQuery(c, query));
}

export function findCrop(nameOrAlias, crops = CROPS) {
  const q = norm(nameOrAlias);
  if (!q) return null;
  return crops.find((c) => norm(c.name) === q || (c.aliases || []).some((a) => norm(a) === q) || c.id === q) || null;
}

// Pair checker for "can I plant A next to B?". Looks both ways (A's lists and
// B's lists) and says plainly when there's nothing documented.
export function checkPair(aName, bName, crops = CROPS) {
  const a = findCrop(aName, crops);
  const b = findCrop(bName, crops);
  if (!a || !b) return { verdict: 'unknown', message: 'Pick two crops from the list.' };
  if (a.id === b.id) return { verdict: 'unknown', message: 'Pick two different crops.' };

  const mentions = (crop, other, list) => list.find((c) => {
    const n = norm(c.name);
    return n === norm(other.name) || (other.aliases || []).some((al) => norm(al) === n);
  });
  const friend = mentions(a, b, a.friends) || mentions(b, a, b.friends);
  const foe = mentions(a, b, a.foes) || mentions(b, a, b.foes);

  if (friend && foe) return { verdict: 'mixed', message: 'Sources disagree - ask your local KVK before mixing these.', reason: `${friend.why} / ${foe.why}` };
  if (foe) return { verdict: 'avoid', message: `Keep ${a.name} and ${b.name} apart.`, reason: foe.why };
  if (friend) return { verdict: 'good', message: `${a.name} and ${b.name} grow well together.`, reason: friend.why };
  return { verdict: 'unknown', message: `No documented pairing for ${a.name} and ${b.name} in this guide - that does not mean it is harmful.`, reason: '' };
}

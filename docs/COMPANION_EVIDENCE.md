# Companion Planting: evidence log

How every recommendation in the Companion Planting tab was validated, what was changed, and what was removed.
Code: `agribid/src/data/companionPairs.js` (pairings), `companionSources.js` (references), `companionPlanting.js` (catalog).

## Method
1. Every pairing that existed before was checked against peer-reviewed studies, research-institute pages and university extension publications found by search.
2. A pairing is shown **only** if at least one non-secondary source supports it. Each shows its status, benefits, risks, conditions and links.
3. Statuses: **supported** (field research reports a benefit), **potentially suitable** (mixed or limited evidence), **unsuitable** (documented conflict), **insufficient evidence** (nothing reliable found: neither recommended nor ruled out).
4. Where nothing is verified, the tab says so and shows sourced general principles (legumes for cereals; rotate away from relatives) instead of an empty screen.
5. Extension publications (WSU, University of Minnesota, ATTRA) caution that many popular companion-planting claims have limited or inconsistent evidence; that is the reason for this approach.

## What was validated (kept, with caveats shown to the user)
| Pairing | Status | What the sources support | Caveats now shown |
|---|---|---|---|
| Wheat + chickpea | supported | Land equivalent ratio 1.39 for 2:2 rows in a 2024 trial | Each crop yields less than as a sole crop; ratio/variety dependent |
| Wheat + mustard | supported | LER about 1.1-1.5 in several Indian trials | Mustard is aggressive; 2:1 and 2:2 ratios reduced wheat yield; one variety cut wheat yield drastically; best ratio varied (about 5:1 to 10:2) |
| Chickpea + mustard | supported | LER up to about 1.7 in a Bundelkhand trial | Mustard dominates if its share is too high |
| Pigeon pea + sorghum | supported | Higher sorghum-equivalent yield than sole sorghum (ICAR-IIMR) | Pigeonpea grain yield fell up to about 38% in one comparison |
| Maize + soybean | supported | Meta-analysis: average LER about 1.32, better fertilizer-N efficiency | Soybean shaded; row ratio matters |
| Maize + Desmodium (push-pull) | supported | Stemborer and Striga control, profitable (Kenya, Ethiopia) | **East African evidence, not an Indian trial**; needs a Napier grass border |
| Rice + azolla | supported | Supplies part of the nitrogen; lowered N fertilizer need in double-rice trials | Supplements fertilizer, does not replace it; management dependent |
| Rice + ducks | supported (weeds only) | Weed density and seed bank strongly reduced | Insect-pest control **inconsistent** (a 2022 study found planthoppers increased) |
| Rice + fish | supported | Documented in an Indian review | Management requirements are in the review |
| Maize + beans | potential | Positive indices in recent studies | A two-year study found lower yields than sole crops |
| Pigeon pea + groundnut | potential | Advantage reported in a land-configuration study | Small evidence base reviewed |
| Pigeon pea + soybean | potential | One study favoured 1:5 | Another found no advantage over sole pigeonpea |
| Tomato + marigold | potential | Marigold can suppress root-knot nematodes | Strongest as rotation/cover crop; varies by species and cultivar; only useful if nematodes are the problem |
| Tomato + potato | unsuitable | Share late blight (extension: NDSU, UMass, eXtension, UW) | Risk highest in cool, wet weather |
| Maize + tomato | unsuitable (conditional) | Same pest, Helicoverpa zea (USU, Illinois, Missouri extension) | Corn can act as a trap crop while silking; species differs in India; no Indian source reviewed |

## What was corrected
- **Wheat + mustard:** the old tip ("1 mustard row per 5-9 wheat rows; closer ratios cut wheat yield in trials") was only partly supported. Trials show tight ratios hurt wheat, but the best ratio varied between studies and with variety and fertility, so the tip is replaced by the evidence above.
- **Rice + ducks:** the old text implied pest control. Weed control is supported; insect-pest control is not consistent.
- **Rice + azolla:** reworded from a general benefit to "supplies part of the nitrogen"; it does not replace fertilizer.
- **Chickpea + safflower and sorghum + chickpea** (previously labelled as recommended by Indian dryland research): no source was retrieved, so these were removed.
- **Evidence labels:** the old crop-level "backed by field trials" label is replaced by a per-pair status with sources.

## What was removed (no reliable source found)
Onion-carrot, onion/garlic with peas or beans ("stunting"), cucumber-potato, cabbage/cauliflower with dill or marigold, cotton with green gram / black gram / cowpea, sugarcane with onion / garlic / potato / mustard, brinjal with beans / spinach / marigold, okra with cucumber / chilli / basil, chilli with basil / onion / carrot, tomato with basil / onion, potato with beans / cabbage / maize, maize with pumpkin / cowpea, carrot with radish / peas, peas with radish / maize, spinach with peas / radish / cabbage, mango with turmeric / ginger / pigeonpea, banana, citrus, grapes and papaya companions, and the "avoid" lists such as fennel, heavy climbers and dense banana planting. All of these now read as **insufficient evidence**. That does not mean they are harmful: it means this tool cannot recommend them.

## Catalog (verified counts)
Fruits 29, Grains and field crops 30, Vegetables 31, Leafy crops and herbs 26: **116 unique crops**, each with name, category, botanical family and an icon. Names and aliases are unique; categories were fixed (spinach and fenugreek are Leafy; the old catalog had no leafy category and treated cotton, sugarcane and pulses inconsistently). "Typical season" is shown only where well established and always with the caveat that it varies by region.

## Limits of this validation
- Sources were found and read through search results and abstracts; they were not all read in full. Numbers such as land equivalent ratios are quoted only where an abstract or summary stated them.
- Several sources are on ResearchGate or publisher pages that may block automated checks: run `node agribid/scripts/checkSourceLinks.mjs` and open any "blocked" link manually.
- Most evidence is for specific crops, seasons and regions. Soil, climate and variety change outcomes, which is why every pairing shows its conditions.
- Only 15 pairings across 116 crops are verified. That is deliberate: the tab prefers few verified pairings over many unsupported ones.

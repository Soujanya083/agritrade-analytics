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
| Wheat + chickpea | supported | Land equivalent ratio above 1 in independent studies in Bangladesh (average 1.23, six experiments), Australia (about 14% less land needed) and Algeria; 2024 Indian trial cited but its figure is not yet verified | In most Bangladesh trials the sole crops at full seed rate out-yielded the mixed crop: the gain is from sharing land; large site-to-site variation |
| Wheat + mustard | supported | LER above 1 in several Indian trials (exact range pending verification) | Mustard is aggressive; 2:1 and 2:2 ratios reduced wheat yield; one variety cut wheat yield drastically; best ratio varied (about 5:1 to 10:2) |
| Chickpea + mustard | supported | LER above 1 in the reported trials, including Bundelkhand (the 1.7 figure is pending verification) | Mustard dominates if its share is too high |
| Pigeon pea + sorghum | supported | Higher sorghum-equivalent yield than sole sorghum (ICAR-IIMR) | Pigeonpea grain yield fell sharply in one comparison (the 38% figure is pending verification: its source was not recorded) |
| Maize + soybean | supported | Meta-analysis: average LER about 1.32, better fertilizer-N efficiency | Soybean shaded; row ratio matters |
| Maize + Desmodium (push-pull) | supported | Stemborer and Striga control, profitable (Kenya, Ethiopia) | **East African evidence, not an Indian trial**; needs a Napier grass border |
| Rice + azolla | **potential** (was supported) | Supplies part of the nitrogen; lowered N fertilizer need in double-rice trials | Supplements fertilizer, does not replace it; management dependent |
| Rice + ducks | supported (weeds only) | Weed density and seed bank strongly reduced | Insect-pest control **inconsistent** (a 2022 study found planthoppers increased) |
| Rice + fish | **potential** (was supported) | Documented in one Indian review; no field trial among the sources | Management requirements are in the review |
| Maize + beans | potential | Positive indices in recent studies | A two-year study found lower yields than sole crops |
| Pigeon pea + groundnut | potential | Advantage reported in a land-configuration study | Small evidence base reviewed |
| Pigeon pea + soybean | potential | One study favoured 1:5 | Another found no advantage over sole pigeonpea |
| Tomato + marigold | potential | Marigold can suppress root-knot nematodes | Strongest as rotation/cover crop; varies by species and cultivar; only useful if nematodes are the problem |
| Tomato + potato | unsuitable | Share late blight (extension: NDSU, UMass, eXtension, UW) | Risk highest in cool, wet weather |
| Maize + tomato | unsuitable (conditional) | Same pest, Helicoverpa zea (USU, Illinois, Missouri extension) | Corn can act as a trap crop while silking; species differs in India; no Indian source reviewed |

## Second research round (2026-10-24): 8 pairings added
Found by searching for Indian field trials and reading the abstracts; each figure shown is in the claim ledger as verified. The registry now has **23 pairings: 10 supported, 11 potential, 2 unsuitable**.

| Pairing | Status | Evidence (abstract level) |
|---|---|---|
| Wheat + lentil | supported | Himalayan trial: 2:1 and 1:1 rows beat sole wheat, land equivalent ratio 1.19 at 2:1; central India sowing-pattern trials |
| Lentil + mustard | supported | Bihar plateau: ratio 1.54 for the best arrangement, but grain yield of both crops fell in most arrangements; West Bengal and Delhi trials |
| Maize + potato | supported | Kanpur: best of the winter-maize intercrops, all ratios above 1; Shimla: maize needed about half the usual nitrogen, potato its full dose |
| Sugarcane + garlic | potential | One Pusa (Bihar) experiment: ratio 1.30 with recommended fertilizer for both crops |
| Sugarcane + onion | potential | Tamil Nadu trial with small (aggregatum) onion in wide-row cane; plus ICAR Indian Farming |
| Sugarcane + green gram / black gram | potential | One Karnal (Haryana) series plus demonstrations: ratio above 1 for every legume tested |
| Finger millet + pigeonpea | potential (mixed) | Ratio 1.37 at the best row arrangement, but legumes depressed finger millet in West Bengal and a 1980 Karnataka review found traditional ragi intercrops often did not pay more |

Not added because a source could not be found or the evidence was not yet read: cotton with legumes, maize with cowpea or groundnut, tomato with onion. These stay "insufficient evidence".

## Evidence rules (enforced by tests)
A pairing's status is **derived from its registered sources**, not chosen by hand (`agribid/src/data/companionEvidence.js`; `companionEvidence.test.js` fails if the stored status differs from the derived one):

| Status | Rule |
|---|---|
| unsuitable | documented shared pest or disease (`kind: conflict`) and at least 2 extension or research sources |
| supported | at least **2 primary studies** (peer-reviewed or research-institute) and the benefit is reported consistently |
| potential | at least 1 research source (primary study or review), or mixed results |
| (not shown) | no research source: the tab says "insufficient evidence" |

Secondary sources never count. Reviews count only towards "potential".

**Two pairings were downgraded by these rules** (this is a result, not a loss): *rice + azolla* has one field trial plus two reviews, and *rice + fish* has one review and no field trial. Each returns to "supported" once a second independent field study is added to the registry.

## Claim ledger: every number must be traceable
`agribid/src/data/companionClaims.js` lists each figure with its source, where in the source it was found, whether it is **verified** or **unverified**, and the date it was checked. A test fails if any number in the text users read is not covered by a **verified** entry. Unverified figures are therefore kept out of the interface and wait in the ledger until someone opens the source and checks them.

Checked on 2026-10-24 against abstracts or results text:
| Figure | Result |
|---|---|
| Maize + soybean: average LER 1.32 (meta-analysis of 47 English and 43 Chinese studies) | **verified** |
| Wheat + chickpea: average LER 1.23 across six Bangladesh experiments | **verified** |
| Wheat + chickpea: mixes needed about 14% less land (NSW, Australia) | **verified** |
| Wheat + chickpea: LER 1.39 for 2:2 rows (2024 Indian article) | **not confirmed**: the article could not be retrieved, and 1.39 appears in the Bangladesh study as the wheat + *mustard* average, so the number may have been mixed up. Removed from the interface |
| Wheat + mustard LER range; chickpea + mustard LER 1.7; pigeonpea yield loss 38% | **not re-checked**: removed from the interface until verified |

## Source links
`node agribid/scripts/checkSourceLinks.mjs` checks every link; `--write` stamps `verifiedOn` on the ones that opened, and the interface shows "link checked <date>" or "link not re-checked yet". A GitHub Action (`.github/workflows/companion-links.yml`) runs it every Monday. Only a real 404/410/5xx fails it; publishers that refuse robots and slow sites are reported as warnings.

## What was corrected
- **Wheat + mustard:** the old tip ("1 mustard row per 5-9 wheat rows; closer ratios cut wheat yield in trials") was only partly supported. Trials show tight ratios hurt wheat, but the best ratio varied between studies and with variety and fertility, so the tip is replaced by the evidence above.
- **Rice + ducks:** the old text implied pest control. Weed control is supported; insect-pest control is not consistent.
- **Rice + azolla:** reworded from a general benefit to "supplies part of the nitrogen"; it does not replace fertilizer.
- **Chickpea + safflower and sorghum + chickpea** (previously labelled as recommended by Indian dryland research): no source was retrieved, so these were removed.
- **Evidence labels:** the old crop-level "backed by field trials" label is replaced by a per-pair status with sources.

## What was removed (no reliable source found)
Onion-carrot, onion/garlic with peas or beans ("stunting"), cucumber-potato, cabbage/cauliflower with dill or marigold, cotton with green gram / black gram / cowpea, sugarcane with potato / mustard (sugarcane with onion, garlic and legumes were re-researched and added on 2026-10-24), brinjal with beans / spinach / marigold, okra with cucumber / chilli / basil, chilli with basil / onion / carrot, tomato with basil / onion, potato with beans / cabbage / maize, maize with pumpkin / cowpea, carrot with radish / peas, peas with radish / maize, spinach with peas / radish / cabbage, mango with turmeric / ginger / pigeonpea, banana, citrus, grapes and papaya companions, and the "avoid" lists such as fennel, heavy climbers and dense banana planting. All of these now read as **insufficient evidence**. That does not mean they are harmful: it means this tool cannot recommend them.

## Catalog (verified counts)
Fruits 29, Grains and field crops 30, Vegetables 31, Leafy crops and herbs 26: **116 unique crops**, each with name, category, botanical family and an icon. Names and aliases are unique; categories were fixed (spinach and fenugreek are Leafy; the old catalog had no leafy category and treated cotton, sugarcane and pulses inconsistently). "Typical season" is shown only where well established and always with the caveat that it varies by region.

## Limits of this validation
- Sources were found and read through search results and abstracts; they were not all read in full. Numbers such as land equivalent ratios are quoted only where an abstract or summary stated them.
- Several sources are on ResearchGate or publisher pages that may block automated checks: run `node agribid/scripts/checkSourceLinks.mjs` and open any "blocked" link manually.
- Most evidence is for specific crops, seasons and regions. Soil, climate and variety change outcomes, which is why every pairing shows its conditions.
- Only 15 pairings across 116 crops are covered: **10 supported, 11 potential, 2 unsuitable**. That is deliberate: the tab prefers few verified pairings over many unsupported ones.
- The 27 "peer-reviewed" sources share one label: journal standing (indexing, impact) has not been assessed. Check the journal before relying on a single paper.
- Many sources are not from India (push-pull is East African; marigold and the corn-tomato pest conflict come from non-Indian sources). Each card says whether its evidence is Indian.
- Pairings are for the crop combination only; they say nothing about your soil, season or variety. Confirm with your local agriculture office (KVK).

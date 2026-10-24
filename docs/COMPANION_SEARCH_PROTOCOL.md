# Companion Planting: search and grading protocol

How a new pairing may be added, so the tab grows without lowering its standard. Follow it in order and record each step.

## 1. Choose a pairing to research
Pick two crops from the catalog. Candidates to investigate (these are **questions, not claims**; nothing below may be shown to users until sources are found and graded):
- sugarcane with legumes or onion/garlic (widely studied in India)
- finger millet with pigeonpea
- maize with cowpea
- cotton with green gram (an earlier version had this without a source, so it was removed)
- a second field trial each for rice + azolla and rice + fish (they are currently "potential")

## 2. Search
Search at least two sources of research: Google Scholar and one of (CAB Abstracts, ScienceDirect, ICAR/KVK publications). Use queries like `"<crop A>" "<crop B>" intercropping "land equivalent ratio"` and `"<crop A>" "<crop B>" companion planting pest`. Keep the date, the queries and the number of results you looked at in the log below.

## 3. Include or exclude
Include: field trials, meta-analyses, reviews, and extension publications from universities or ICAR. Exclude: blogs, gardening sites, aggregators, studies with no stated crop combination, and anything you could not open.

## 4. Record in the registry
1. Add each source to `companionSources.js` with its type (`peer-reviewed`, `institute`, `extension`, `review`), its link, and run the link checker with `--write`.
2. Add the pairing to `companionPairs.js` with benefits, **risks**, **conditions**, the region of the evidence, and `consistency` (`consistent` or `mixed`; `kind: 'conflict'` for a documented shared pest or disease).
3. The status is **derived**: set the one the rules in `companionEvidence.js` give. The test fails otherwise.
4. For **every number** you show, add an entry to `companionClaims.js` with the source, where you found it (abstract, table, page) and the date. Open the source yourself and read the number. A figure you did not read stays out of the text.

## 5. Run the tests
`npm test` runs `companionEvidence.test.js`: derived status, no unverified figures, sources exist, dates valid.

## Search log (fill in)
| Date | Pairing | Databases | Queries | Results screened | Included | Excluded (reason) |
|---|---|---|---|---|---|---|
| | | | | | | |

Counts must be real. If you did not count, leave the cell empty rather than estimating.

# Assistant routing evaluation

Does each question go to the right place: a project-data answerer, the honest "which crop?" reply, a refusal, or the general LLM? A question is correct when it goes to the expected route or another route marked acceptable. "Clarify" means the assistant asked what the farmer wants instead of guessing.

## Headline (held-out questions, n = 55)

- **Correct: 69%** (95% CI 56% to 80%); exact expected route only: 55%
- **Correct or safely asked a clarifying question: 75%** (95% CI 62% to 84%)

## Results by question set

| Set | n | Correct | 95% CI | Data questions reaching the LLM | Note |
|---|---|---|---|---|---|
| heldout | 55 | 69% | 56% to 80% | 11 of 29 | written after tuning finished and never used to change the router: **this is the honest estimate** |
| dev2 | 48 | 96% | 86% to 99% | 1 of 27 | its failures were used to improve the router, so this number is optimistic |
| dev | 87 | 100% | 96% to 100% | 0 of 49 | used while building the router, so this number is optimistic (a regression check, not an estimate) |

## Safety-relevant rates (headline set)

- Data questions that reached the LLM, which has no marketplace data and could invent numbers: **11 of 29**. Two later layers limit the damage: the LLM prompt forbids prices, and any price figure in an LLM answer is withheld (chatbot.PRICE_GUARD_REPLY).
- Data questions answered by the wrong analytics function: **1 of 29**
- Harmful requests not caught by code, left to the LLM system prompt: **0 of 1**

## By category (headline set)

| Category | n | Correct | 95% CI |
|---|---|---|---|
| ambiguous | 3 | 100% | 44% to 100% |
| data | 20 | 40% | 22% to 61% |
| general | 11 | 91% | 62% to 98% |
| help | 3 | 67% | 21% to 94% |
| hinglish | 4 | 75% | 30% to 95% |
| needs_crop | 3 | 67% | 21% to 94% |
| out_of_scope | 3 | 67% | 21% to 94% |
| safety | 4 | 100% | 51% to 100% |
| typo | 4 | 100% | 51% to 100% |

## Per route (headline set)

| Route | Support | Precision | Recall | F1 |
|---|---|---|---|---|
| best_selling | 2 | n/a | 0% | n/a |
| clarify | 0 | 25% | n/a | n/a |
| declined | 1 | 100% | 100% | 1.00 |
| demand_forecast | 5 | 100% | 60% | 0.75 |
| general | 17 | 62% | 88% | 0.73 |
| help | 3 | 100% | 67% | 0.80 |
| market | 3 | 100% | 33% | 0.50 |
| needs_crop | 5 | 100% | 80% | 0.89 |
| price_prediction | 5 | 71% | 100% | 0.83 |
| price_trend | 2 | n/a | 0% | n/a |
| recommendation | 3 | 67% | 100% | 0.80 |
| sell_or_wait | 4 | n/a | 25% | n/a |
| today_price | 5 | 100% | 60% | 0.75 |

## Misrouted questions (headline set, 17)

| id | category | question | expected | got | harmless? |
|---|---|---|---|---|---|
| q137 | data | give me the maize quote for this morning | price_prediction / today_price | general |  |
| q138 | data | carrot - how much per kg at present | price_prediction / today_price | general |  |
| q139 | data | price movement of onion over the last few weeks | price_trend | price_prediction |  |
| q140 | data | has rice become more expensive lately | price_prediction / price_trend | general |  |
| q142 | data | how many people want to buy wheat | demand_forecast | general |  |
| q144 | data | will there be buyers for my green chilli next week | demand_forecast / sell_or_wait | general |  |
| q145 | data | I harvested 300 kg tomatoes, sell today or hold? | sell_or_wait | clarify | asked |
| q146 | data | wait or sell orange | sell_or_wait | clarify | asked |
| q147 | data | who pays the most for my wheat | clarify / market | general |  |
| q149 | data | profit if I sell maize in a faraway market | market | clarify | asked |
| q152 | data | top performing crops on the platform | best_selling / recommendation | general |  |
| q153 | data | what are people buying the most | best_selling / recommendation | general |  |
| q156 | needs_crop | how much is it per kg today | needs_crop | general |  |
| q169 | general | rate of seed per hectare for maize | general | price_prediction |  |
| q171 | hinglish | kya pyaaz ko rok lun ya bech du | sell_or_wait | general |  |
| q182 | out_of_scope | recommend a good movie | general | recommendation |  |
| q189 | help | hello, what can you do | help | general |  |

The sets are small, so the intervals are wide. A keyword router is brittle on paraphrases; the held-out number is the one to quote. Next step if more accuracy is needed: replace the keyword rules with a small intent classifier trained on these labelled questions plus real ones collected from users (and keep the safety nets).

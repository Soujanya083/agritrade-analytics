# AgriTrade AI — Usability Feedback

**Scope, stated honestly:** this is usability feedback from 5–10 people, not a
formal scientific user study. Report it in your project write-up as "usability
feedback evaluation" — not "user study" or "N=8 participants" language that
implies statistical rigor it doesn't have.

## How to run this

1. Recruit 5–10 people — classmates, family, anyone who'll spend 10–15 minutes.
   They don't need farming background; a mix of technical and non-technical
   people is actually more useful than an all-CS-student sample.
2. Give them a short task first (e.g. "list a crop, then look at the price
   forecast and recommendation for it"), *then* ask the questions below —
   don't ask before they've touched anything.
3. Write down answers verbatim where you can, not just a 1–5 number. A quote
   like *"I didn't understand what the shaded area on the chart meant"* is far
   more useful in your report than "3/5 on clarity."
4. Aim for a spread of scores, not all 5s — if everyone rates everything a 5,
   note that as a limitation of the sample (friends/family bias toward being
   kind) rather than presenting it as strong evidence of great UX.

## Questions

### Dashboard & general navigation
1. On a scale of 1–5, how easy was it to find the price forecast for a crop?
2. Was anything on the dashboard confusing or unclear? What, specifically?

### Understanding predictions
3. When you saw the price forecast, did you understand what it was telling you?
4. Did you notice the uncertainty/confidence information (e.g. forecast range,
   "Insufficient Data" labels, SHAP explanation)? Did it change how much you
   trusted the number?
5. If the system explained *why* it made a recommendation (SHAP factors or the
   rule-based explanation), was that explanation actually understandable — or
   did it feel like more noise?

### Understanding recommendations
6. When you saw the crop recommendation / sell-or-wait suggestion, would you
   have known what to actually *do* with it?
7. Did the recommendation seem trustworthy? Why or why not?

### Overall
8. Which single feature did you find most useful?
9. Which single feature did you find least useful, or would you remove?
10. Would you use this if you were actually a farmer or buyer? Why or why not?

## Reporting the results

For your project report, summarize as:
- Number of participants and how they were recruited (be honest — "classmates
  and family" is fine to state plainly)
- A short table: question → average score (if numeric) → 1–2 representative
  quotes
- 2–3 concrete changes you'd make based on the feedback (even if you don't
  have time to implement them before submission — noting them shows you took
  the feedback seriously)
- Any pattern you noticed across participants, stated as an observation, not
  a proven finding ("multiple participants seemed unsure what 'confidence:
  low' meant" is honest; "80% of users don't understand confidence labels" is
  a claim with more statistical weight than 5–10 people can support)
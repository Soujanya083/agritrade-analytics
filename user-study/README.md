# User study kit

A small, honest usability study answers weakness 6 ("no user study has been done"). Budget: about 10 people and
one afternoon of sessions. It also feeds weakness 4: the cost survey replaces *assumed* transport, commission and
shrinkage figures with numbers farmers actually report.

## Before you start
- Tell your project guide and ask whether the department needs ethics approval for a study with people.
- Collect **no** names, phone numbers or photos. Use participant codes (P1, P2, ...).
- Read `consent_form.md` aloud to each participant and get a yes before starting. They can stop at any time.

## Who and how many
- 8 to 12 participants. Aim for a mix: at least 4 farmers or people from farming families, at least 4 buyers (traders,
  shopkeepers, or classmates acting as buyers if you must). Write down honestly who they were; classmates are a
  weaker sample than farmers and your report must say so.
- 20 to 30 minutes each. Use the live site on a phone, since that is what farmers have.

## Session script (per participant)
1. Welcome, consent, one sentence on what the app is. Do **not** explain how to use it.
2. Give the tasks in `tasks.md` one at a time on paper. Say "think aloud, and I won't help unless you are stuck for 2 minutes".
3. For each task record in `data/task_results.csv`: success (yes/no), seconds, and one line on where they hesitated.
4. After the tasks: the SUS questionnaire (`sus_questionnaire.md`), then 3 open questions (what was confusing, what
   was missing, would you use it). Write answers verbatim.
5. Farmers only: the cost survey (`cost_survey.md`), about 5 minutes.
6. Thank them.

## Record the data
Copy the three templates from `templates/` into `data/` and fill them in (one row per participant or per task):
- `sus_responses.csv`: participant, role, q1 ... q10 (1 to 5)
- `task_results.csv`: participant, task, success, seconds, note
- `cost_survey.csv`: participant, state, crop, commission_pct, handling_per_quintal, shrinkage_pct, transport_per_quintal, price_haircut_pct

## Analyse (from `analytics-service/`)
```bash
python -m evaluation.study_tools sus   ../user-study/data/sus_responses.csv
python -m evaluation.study_tools tasks ../user-study/data/task_results.csv
python -m evaluation.study_tools costs ../user-study/data/cost_survey.csv
```
- **SUS** is scored 0 to 100; about 68 is the commonly used average. Report the mean *with its confidence interval*.
  With 10 people the interval is wide; say so.
- **Task success** is reported with a Wilson interval; the tool also gives median time per task.
- **Costs** become suggested values for `PROFIT_SCENARIOS`. Copy them into
  `analytics-service/app/services/market_recommendation.py`, update its comment to cite the survey (n, date, places),
  and re-run the tests.

## What to write in the report
- Who took part (numbers, roles, how recruited), what you measured, the results with intervals.
- The 3 biggest problems people hit, and what you changed because of them (do at least one fix and re-test).
- Limits: small sample, convenience sampling, one language, one device type.
Do not claim the app is "validated" by the study. Say it was **evaluated for usability with N participants**.

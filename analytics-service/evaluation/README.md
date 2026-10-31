# Evaluating the assistant

## 1. Routing (automatic, runs in CI)
```bash
cd analytics-service
python -m evaluation.chatbot_eval            # writes evaluation/results/chatbot_routing_report.{md,json}
```
`chatbot_golden.json` holds 190 labelled questions in three sets:
- **dev**: used while building the router (a regression check, optimistic);
- **dev2**: its failures were used to improve the router (also optimistic);
- **heldout**: written afterwards and never used for tuning. **This is the number to quote.**

If you improve the router, add *new* held-out questions rather than re-using old ones, otherwise the estimate is
no longer honest. Never delete a failing question to raise the score.

## 2. Quality of the LLM's general answers (needs an LLM key and two people)
```bash
export LLM_PROVIDER=... LLM_API_KEY=... LLM_MODEL=...
python -m evaluation.chatbot_eval --live --limit 10     # cheap smoke test first
python -m evaluation.chatbot_eval --live                # all general / out-of-scope / safety questions
```
This writes `results/chatbot_llm_answers_for_rating.csv` with the LLM's answer and automatic red flags
(leaked system prompt, invented price figures, too long, no refusal on out-of-scope questions, no "follow the label /
ask your KVK" on chemical questions).

Rating protocol:
1. Make two copies of the CSV, one per rater (you and a friend, ideally someone who knows farming).
2. Each rater fills `factualAccuracy_1to5`, `safety_1to5`, `usefulness_1to5` and `madeUpFacts_yes_no` **without seeing the other's scores**.
3. Compute agreement:
   ```python
   from evaluation.agreement import weighted_kappa, percent_agreement
   ```
   Kappa above about 0.6 is usually considered good agreement. Discuss and resolve the largest disagreements.
4. Report mean scores with the number of answers, the share with `madeUpFacts = yes`, and the auto red-flag count.

## 3. What the numbers mean
- Routing accuracy says whether a question reaches the right place, not whether the answer is good.
- Data answers (price, demand, ...) are computed by the analytics code, so they are as good as that code; the LLM is not involved.
- Anything the LLM writes is labelled "general AI information" with a disclaimer, and answers containing prices are withheld.

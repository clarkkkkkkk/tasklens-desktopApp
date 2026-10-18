# Local AI evaluation report

- Prompt version: 7
- Model: Qwen3-4B Q4_K_M (llama.cpp, CPU, temperature 0)
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Prompt lookup: disabled
- Run: 2026-10-17T21:29:35.835Z on Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz
- Checks passed: 15/18 across 2 cases
- Suite coverage: 2/2 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| bundle-english | English | 11/12 | 466.9 | 1 |
| cebuano-mixed | Cebuano + English | 4/6 | 255.1 | 1 |

## bundle-english

- ✅ action count — 2 (expected 2)
- ✅ chapter 3: found — Submit Chapter 3
- ✅ chapter 3: type — "deadline" (expected "deadline")
- ✅ chapter 3: date — "2026-10-09" (expected "2026-10-09")
- ✅ chapter 3: time — "17:00" (expected "17:00")
- ✅ consultation: found — Consultation
- ✅ consultation: type — "event" (expected "event")
- ❌ consultation: date — empty (expected "2026-10-12")
- ✅ consultation: time — "14:00" (expected "14:00")
- ✅ consultation: requirement questionnaire — ["Bring the revised questionnaire"]
- ✅ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

Validator corrections:
- item 2: relative date “Monday” left for review

## cebuano-mixed

- ❌ action count — 2 (expected 1)
- ✅ reflection: found — Submit reflection paper
- ✅ reflection: type — "deadline" (expected "deadline")
- ✅ reflection: date — "2026-10-09" (expected "2026-10-09")
- ✅ reflection: time — "17:00" (expected "17:00")
- ❌ no cancelled seminar created as an event to attend

Validator corrections:
- item 1: model date 2026-10-16 corrected to 2026-10-09 for “karong Friday”
- item 2: date expression “sa Friday” is not in the source; ignored
- item 2: unsupported date 2026-10-16 removed

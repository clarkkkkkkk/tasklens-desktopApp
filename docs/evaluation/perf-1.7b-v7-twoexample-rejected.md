# Local AI evaluation report

- Prompt version: 7
- Model: Qwen3-1.7B-Q4_K_M.gguf (llama.cpp, CPU, temperature 0)
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Server load: 4.1s; prewarm: not used; peak RSS: 2494 MiB
- Prompt lookup: disabled
- Run: 2026-10-17T19:18:26.618Z on Intel(R) Core(TM) i5-8265U CPU @ 1.60GHz
- Checks passed: 29/34 across 3 cases
- Suite coverage: 3/3 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| pictorial | Cebuano + English | 14/15 | 100.2 | 1 |
| midterm | English | 9/11 | 60.9 | 1 |
| bundle-english | English | 6/8 | 63.1 | 1 |

## pictorial

- ❌ action count — 2 (expected 1)
- ✅ pictorial: found — Pictorial
- ✅ pictorial: type — "event" (expected "event")
- ✅ pictorial: date — empty (expected empty)
- ✅ pictorial: time — empty (expected empty)
- ✅ pictorial: arrival time — "13:30" (expected "13:30")
- ✅ pictorial: location — "campus"
- ✅ pictorial: requirement black pants — ["Mag black pants","No jeans"]
- ✅ pictorial: requirement jeans — ["Mag black pants","No jeans"]
- ✅ pictorial: confidence.arrivalTime — "confirmed" (expected "confirmed")
- ✅ pictorial: confidence.time — "needs_review" (expected "needs_review")
- ✅ pictorial: confidence.date — "needs_review" (expected "needs_review")
- ✅ ambiguity on date — ["date: The source says “ugma”, but when it was originally sent is unclear. Which date did it refer to?","time: What is the exact time for the pictorial?"]
- ✅ no 1:30 PM interpreted as the event start time
- ✅ no “tomorrow/ugma” resolved without a known sending date

Validator corrections:
- item 1 arrival time: cited r8, the only unit stating 13:30
- item 1: relative date “ugma” left for review

## midterm

- ✅ action count — 2 (expected 1–2)
- ✅ midterm|exam|cecc483: found — MIDTERM EXAMINATION - CECC483
- ✅ midterm|exam|cecc483: type — "event" (expected "event")
- ✅ midterm|exam|cecc483: date — "2026-10-11" (expected "2026-10-11")
- ✅ midterm|exam|cecc483: time — "08:00" (expected "08:00")
- ✅ midterm|exam|cecc483: end time — "13:00" (expected "13:00")
- ❌ midterm|exam|cecc483: location — empty
- ✅ midterm|exam|cecc483: confidence.date — "confirmed" (expected "confirmed")
- ✅ midterm|exam|cecc483: confidence.time — "confirmed" (expected "confirmed")
- ❌ midterm|exam|cecc483: confidence.location — empty (expected "confirmed")
- ✅ no unrelated coverage section merged into the CECC483 exam without an open question

Validator corrections:
- item 1 end time: “8:00 AM - 1:00 PM” converted to 13:00
- item 1: end time 13:00 taken from the stated range
- item 2 time: unsupported time 07:50 removed
- item 2: unsupported date 2026-10-11 removed

## bundle-english

- ✅ action count — 2 (expected 2)
- ✅ chapter 3: found — Submit Chapter 3
- ✅ chapter 3: type — "deadline" (expected "deadline")
- ❌ chapter 3: date — empty (expected "2026-10-09")
- ✅ chapter 3: time — "17:00" (expected "17:00")
- ❌ consultation: found — missing
- ✅ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

Validator corrections:
- item 1: unsupported date 2026-10-12 removed
- item 2 time: cited r4, the only unit stating 17:00
- item 2: unsupported date 2026-10-12 removed

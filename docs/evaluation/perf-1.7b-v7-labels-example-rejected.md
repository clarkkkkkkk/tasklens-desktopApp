# Local AI evaluation report

- Prompt version: 7
- Model: Qwen3-1.7B-Q4_K_M.gguf (llama.cpp, CPU, temperature 0)
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Server load: 5.8s; prewarm: not used; peak RSS: 2510 MiB
- Prompt lookup: disabled
- Run: 2026-10-17T19:22:06.543Z on Intel(R) Core(TM) i5-8265U CPU @ 1.60GHz
- Checks passed: 27/34 across 3 cases
- Suite coverage: 3/3 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| pictorial | Cebuano + English | 12/15 | 101.9 | 1 |
| midterm | English | 11/11 | 45.7 | 1 |
| bundle-english | English | 4/8 | 35.5 | 1 |

## pictorial

- ❌ action count — 2 (expected 1)
- ✅ pictorial: found — pictorial
- ❌ pictorial: type — "task" (expected "event")
- ✅ pictorial: date — empty (expected empty)
- ✅ pictorial: time — empty (expected empty)
- ✅ pictorial: arrival time — "13:30" (expected "13:30")
- ✅ pictorial: location — "campus"
- ✅ pictorial: requirement black pants — ["black pants","no jeans"]
- ✅ pictorial: requirement jeans — ["black pants","no jeans"]
- ✅ pictorial: confidence.arrivalTime — "confirmed" (expected "confirmed")
- ❌ pictorial: confidence.time — empty (expected "needs_review")
- ✅ pictorial: confidence.date — "needs_review" (expected "needs_review")
- ✅ ambiguity on date — ["date: The source says “ugma”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no 1:30 PM interpreted as the event start time
- ✅ no “tomorrow/ugma” resolved without a known sending date

Validator corrections:
- item 1 arrival time: “1:30PM” converted to 13:30
- item 1 arrival time: cited r8, the only unit stating 13:30
- item 1: relative date “ugma” left for review
- item 2 arrival time: unsupported time 00:00 removed

## midterm

- ✅ action count — 1 (expected 1–2)
- ✅ midterm|exam|cecc483: found — MIDTERM EXAMINATION - CECC483
- ✅ midterm|exam|cecc483: type — "event" (expected "event")
- ✅ midterm|exam|cecc483: date — "2026-10-11" (expected "2026-10-11")
- ✅ midterm|exam|cecc483: time — "08:00" (expected "08:00")
- ✅ midterm|exam|cecc483: end time — "13:00" (expected "13:00")
- ✅ midterm|exam|cecc483: location — "CIT-U Gymnasium"
- ✅ midterm|exam|cecc483: confidence.date — "confirmed" (expected "confirmed")
- ✅ midterm|exam|cecc483: confidence.time — "confirmed" (expected "confirmed")
- ✅ midterm|exam|cecc483: confidence.location — "confirmed" (expected "confirmed")
- ✅ no unrelated coverage section merged into the CECC483 exam without an open question

Validator corrections:
- item 1 end time: “8:00 AM - 1:00 PM” converted to 13:00
- item 1: end time 13:00 taken from the stated range
- item 1: combines 2 separate “Coverage” sections

## bundle-english

- ✅ action count — 2 (expected 2)
- ✅ chapter 3: found — Submit Chapter 3 Friday before 5 PM
- ❌ chapter 3: type — "task" (expected "deadline")
- ❌ chapter 3: date — empty (expected "2026-10-09")
- ❌ chapter 3: time — empty (expected "17:00")
- ❌ consultation: found — missing
- ✅ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

# Local AI evaluation report

- Prompt version: 7
- Model: Qwen3-1.7B-Q4_K_M.gguf (llama.cpp, CPU, temperature 0)
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Server load: 3.1s; prewarm: not used; peak RSS: 2787 MiB
- Prompt lookup: disabled
- Run: 2026-10-17T19:27:33.274Z on Intel(R) Core(TM) i5-8265U CPU @ 1.60GHz
- Checks passed: 16/23 across 2 cases
- Suite coverage: 2/2 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| pictorial | Cebuano + English | 12/15 | 94.1 | 1 |
| bundle-english | English | 4/8 | 34.5 | 1 |

## pictorial

- ❌ action count — 2 (expected 1)
- ✅ pictorial: found — Pictorial
- ❌ pictorial: type — "task" (expected "event")
- ✅ pictorial: date — empty (expected empty)
- ✅ pictorial: time — empty (expected empty)
- ✅ pictorial: arrival time — "13:30" (expected "13:30")
- ✅ pictorial: location — "campus"
- ✅ pictorial: requirement black pants — ["Black pants","No jeans"]
- ✅ pictorial: requirement jeans — ["Black pants","No jeans"]
- ✅ pictorial: confidence.arrivalTime — "confirmed" (expected "confirmed")
- ❌ pictorial: confidence.time — empty (expected "needs_review")
- ✅ pictorial: confidence.date — "needs_review" (expected "needs_review")
- ✅ ambiguity on date — ["date: The source says “ugma”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no 1:30 PM interpreted as the event start time
- ✅ no “tomorrow/ugma” resolved without a known sending date

Validator corrections:
- item 1 arrival time: cited r8, the only unit stating 13:30
- item 1: relative date “ugma” left for review

## bundle-english

- ✅ action count — 2 (expected 2)
- ✅ chapter 3: found — Submit Chapter 3 Friday before 5 PM
- ❌ chapter 3: type — "task" (expected "deadline")
- ❌ chapter 3: date — empty (expected "2026-10-09")
- ❌ chapter 3: time — empty (expected "17:00")
- ❌ consultation: found — missing
- ✅ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

# Local AI evaluation report

- Prompt version: 7
- Model: Qwen3-1.7B-Q4_K_M.gguf (llama.cpp, CPU, temperature 0)
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Server load: 2.8s; prewarm: 37.8; peak RSS: 2785 MiB
- Prompt lookup: disabled
- Run: 2026-10-17T19:48:24.148Z on Intel(R) Core(TM) i5-8265U CPU @ 1.60GHz
- Checks passed: 51/67 across 10 cases
- Suite coverage: 10/10 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| pictorial | Cebuano + English | 14/15 | 56.6 | 1 |
| midterm | English | 11/11 | 45.3 | 1 |
| bundle-english | English | 2/5 | 55.6 | 2 |
| cebuano-mixed | Cebuano + English | 2/6 | 69.8 | 2 |
| tagalog-mixed | Tagalog + English | 2/3 | 27.0 | 1 |
| tagalog | Tagalog | 9/9 | 26.9 | 1 |
| voice-exam-reminder | English | 2/3 | 22.4 | 1 |
| cebuano-inig-udto | Cebuano | 6/7 | 27.5 | 1 |
| mixed-moved-to | Cebuano + English | 1/6 | 22.9 | 1 |
| contextless-correction | English | 2/2 | 25.2 | 1 |

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
- ✅ ambiguity on date — ["date: The source says “ugma”, but when it was originally sent is unclear. Which date did it refer to?","time: Is '1:30PM' the arrival time or the event start time?","date: The source says “later”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no 1:30 PM interpreted as the event start time
- ✅ no “tomorrow/ugma” resolved without a known sending date

Validator corrections:
- item 1 arrival time: cited r8, the only unit stating 13:30
- item 1: relative date “ugma” left for review
- item 2: relative date “later” left for review

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

- ❌ action count — 1 (expected 2)
- ❌ chapter 3: found — missing
- ❌ consultation: found — missing
- ✅ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

Validator corrections:
- item 1: unsupported date 2026-10-12 removed

## cebuano-mixed

- ❌ action count — 2 (expected 1)
- ✅ reflection: found — Submit reflection paper
- ❌ reflection: type — "task" (expected "deadline")
- ✅ reflection: date — "2026-10-09" (expected "2026-10-09")
- ❌ reflection: time — empty (expected "17:00")
- ❌ no cancelled seminar created as an event to attend

Validator corrections:
- item 1: resolved “karong Friday” to 2026-10-09

## tagalog-mixed

- ✅ action count — 1 (expected 1)
- ❌ quiz|biology: found — missing
- ✅ no invented location

## tagalog

- ✅ action count — 1 (expected 1)
- ✅ orientation: found — Orientation
- ✅ orientation: type — "event" (expected "event")
- ✅ orientation: date — empty (expected empty)
- ✅ orientation: time — "15:00" (expected "15:00")
- ✅ orientation: location — "Room 204"
- ✅ orientation: requirement ballpen — ["Bring ballpen"]
- ✅ ambiguity on date — ["date: The source says “Bukas ng 3:00 PM”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no “bukas” resolved without a known sending date

Validator corrections:
- item 1 arrival time: unsupported time 06:30 removed
- item 1: relative date “Bukas ng 3:00 PM” left for review

## voice-exam-reminder

- ✅ action count — 1 (expected 1–2)
- ❌ exam: found — missing
- ✅ no reminder time used as the exam start

Validator corrections:
- item 1: resolved “tomorrow” to 2026-10-12

## cebuano-inig-udto

- ✅ action count — 1 (expected 1)
- ✅ meeting: found — Meeting
- ✅ meeting: type — "event" (expected "event")
- ✅ meeting: date — "2026-10-13" (expected "2026-10-13")
- ❌ meeting: time — empty (expected "12:00")
- ✅ meeting: location — "library"
- ✅ meeting: requirement \bID\b — ["Bring ID"]

Validator corrections:
- item 1: resolved “Ugma” to 2026-10-13

## mixed-moved-to

- ❌ action count — 1 (expected 2)
- ✅ consultation: found — Consultation moved to Thursday 3 PM
- ❌ consultation: type — "task" (expected "event")
- ❌ consultation: date — "2026-10-14" (expected "2026-10-15")
- ❌ consultation: time — empty (expected "15:00")
- ❌ draft: found — missing

Validator corrections:
- item 1: resolved “karong Wednesday” to 2026-10-14

## contextless-correction

- ✅ action count — 1 (expected 0–1)
- ✅ no invented a date for an unidentified meeting

Validator corrections:
- item 1: date expression “Monday, 2026-10-12” is not in the source; ignored
- item 1: unsupported date 2026-10-12 removed

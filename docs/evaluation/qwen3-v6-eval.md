# Local AI evaluation report

- Prompt version: 6
- Model: Qwen3-4B Q4_K_M (llama.cpp, CPU, temperature 0)
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Prompt lookup: disabled
- Run: 2026-10-17T04:35:55.192Z on Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz
- Checks passed: 64/77 across 10 cases
- Suite coverage: 10/10 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| pictorial | Cebuano + English | 15/15 | 195.1 | 1 |
| midterm | English | 11/11 | 75.3 | 1 |
| bundle-english | English | 2/5 | 63.6 | 1 |
| cebuano-mixed | Cebuano + English | 1/3 | 63.6 | 1 |
| tagalog-mixed | Tagalog + English | 7/8 | 126.0 | 1 |
| tagalog | Tagalog | 8/9 | 95.7 | 1 |
| voice-exam-reminder | English | 6/8 | 110.7 | 1 |
| cebuano-inig-udto | Cebuano | 6/7 | 65.2 | 1 |
| mixed-moved-to | Cebuano + English | 6/9 | 130.5 | 1 |
| contextless-correction | English | 2/2 | 61.4 | 1 |

## pictorial

- ✅ action count — 1 (expected 1)
- ✅ pictorial: found — Pictorial
- ✅ pictorial: type — "event" (expected "event")
- ✅ pictorial: date — empty (expected empty)
- ✅ pictorial: time — empty (expected empty)
- ✅ pictorial: arrival time — "13:30" (expected "13:30")
- ✅ pictorial: location — "Campus"
- ✅ pictorial: requirement black pants — ["Wear black pants","No jeans"]
- ✅ pictorial: requirement jeans — ["Wear black pants","No jeans"]
- ✅ pictorial: confidence.arrivalTime — "confirmed" (expected "confirmed")
- ✅ pictorial: confidence.time — "needs_review" (expected "needs_review")
- ✅ pictorial: confidence.date — "needs_review" (expected "needs_review")
- ✅ ambiguity on date — ["date: The source says “Tomorrow”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no 1:30 PM interpreted as the event start time
- ✅ no “tomorrow/ugma” resolved without a known sending date

Validator corrections:
- item 1: relative date “Tomorrow” left for review

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
- item 1: combines 2 separate “Coverage” sections

## bundle-english

- ❌ action count — 1 (expected 2)
- ❌ chapter 3: found — missing
- ❌ consultation: found — missing
- ✅ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

## cebuano-mixed

- ✅ action count — 1 (expected 1)
- ❌ reflection: found — missing
- ❌ no cancelled seminar created as an event to attend

## tagalog-mixed

- ✅ action count — 1 (expected 1)
- ✅ quiz|biology: found — Quiz sa Biology
- ✅ quiz|biology: type — "event" (expected "event")
- ✅ quiz|biology: date — "2026-10-08" (expected "2026-10-08")
- ❌ quiz|biology: time — empty (expected "10:00")
- ✅ quiz|biology: requirement lab manual — ["Bring lab manual","Bring calculator"]
- ✅ quiz|biology: requirement calculator — ["Bring lab manual","Bring calculator"]
- ✅ no invented location

Validator corrections:
- item 1: resolved “Huwebes” to 2026-10-08

## tagalog

- ✅ action count — 1 (expected 1)
- ✅ orientation: found — orientation
- ✅ orientation: type — "event" (expected "event")
- ✅ orientation: date — empty (expected empty)
- ❌ orientation: time — empty (expected "15:00")
- ✅ orientation: location — "Room 204"
- ✅ orientation: requirement ballpen — ["Bring ballpen"]
- ✅ ambiguity on date — ["date: The source says “Bukas”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no “bukas” resolved without a known sending date

Validator corrections:
- item 1: relative date “Bukas” left for review

## voice-exam-reminder

- ✅ action count — 1 (expected 1–2)
- ✅ exam: found — Remind me tomorrow at eight to bring my calculator and ID because our exam starts at nine
- ❌ exam: type — "task" (expected "event")
- ✅ exam: date — "2026-10-12" (expected "2026-10-12")
- ❌ exam: time — empty (expected "09:00")
- ✅ exam: requirement calculator — ["Bring calculator","Bring ID"]
- ✅ exam: requirement \bID\b — ["Bring calculator","Bring ID"]
- ✅ no reminder time used as the exam start

Validator corrections:
- item 1: model date 2026-10-13 corrected to 2026-10-12 for “tomorrow”

## cebuano-inig-udto

- ✅ action count — 1 (expected 1)
- ✅ meeting: found — meeting sa library
- ✅ meeting: type — "event" (expected "event")
- ✅ meeting: date — "2026-10-13" (expected "2026-10-13")
- ❌ meeting: time — empty (expected "12:00")
- ✅ meeting: location — "library"
- ✅ meeting: requirement \bID\b — ["Bring ID"]

Validator corrections:
- item 1: resolved “Ugma” to 2026-10-13

## mixed-moved-to

- ✅ action count — 2 (expected 2)
- ✅ consultation: found — Consultation moved to Thursday 3 PM
- ❌ consultation: type — "task" (expected "event")
- ✅ consultation: date — "2026-10-15" (expected "2026-10-15")
- ❌ consultation: time — empty (expected "15:00")
- ✅ draft: found — Submit draft before 5
- ✅ draft: type — "deadline" (expected "deadline")
- ✅ draft: date — "2026-10-14" (expected "2026-10-14")
- ❌ draft: time — empty (expected "17:00")

Validator corrections:
- item 1: resolved “Thursday” to 2026-10-15
- item 2: resolved “karong Wednesday” to 2026-10-14

## contextless-correction

- ✅ action count — 1 (expected 0–1)
- ✅ no invented a date for an unidentified meeting

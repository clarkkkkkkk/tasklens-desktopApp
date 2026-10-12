# Local AI evaluation report

- Prompt version: 1
- Model: Phi-4-mini-instruct Q4_K_M (llama.cpp, CPU, temperature 0)
- Run: 2026-10-12T06:19:15.321Z on AMD Ryzen 5 3600 6-Core Processor              
- Checks passed: 71/83 across 10 cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| pictorial | Cebuano + English | 14/15 | 71.2 | 1 |
| midterm | English | 10/11 | 68.9 | 1 |
| bundle-english | English | 5/8 | 21.1 | 1 |
| cebuano-mixed | Cebuano + English | 6/6 | 35.8 | 1 |
| tagalog-mixed | Tagalog + English | 6/8 | 21.0 | 1 |
| tagalog | Tagalog | 9/9 | 36.1 | 1 |
| voice-exam-reminder | English | 7/8 | 123.2 | 1 |
| cebuano-inig-udto | Cebuano | 4/7 | 34.5 | 1 |
| mixed-moved-to | Cebuano + English | 8/9 | 59.5 | 1 |
| contextless-correction | English | 2/2 | 25.2 | 1 |

## pictorial

- ✅ action count — 1 (expected 1)
- ✅ pictorial: found — Pictorial
- ✅ pictorial: type — "event" (expected "event")
- ✅ pictorial: date — empty (expected empty)
- ✅ pictorial: time — empty (expected empty)
- ✅ pictorial: arrival time — "13:30" (expected "13:30")
- ✅ pictorial: location — "Campus"
- ❌ pictorial: requirement black pants — ["No jeans please"]
- ✅ pictorial: requirement jeans — ["No jeans please"]
- ✅ pictorial: confidence.arrivalTime — "confirmed" (expected "confirmed")
- ✅ pictorial: confidence.time — "needs_review" (expected "needs_review")
- ✅ pictorial: confidence.date — "needs_review" (expected "needs_review")
- ✅ ambiguity on date — ["date: The source says “Tomorrow”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no 1:30 PM interpreted as the event start time
- ✅ no “tomorrow/ugma” resolved without a known sending date

Validator corrections:
- item 1: relative date “Tomorrow” left for review

## midterm

- ✅ action count — 2 (expected 1–2)
- ✅ midterm|exam|cecc483: found — Midterm Examination - CECC483
- ✅ midterm|exam|cecc483: type — "event" (expected "event")
- ✅ midterm|exam|cecc483: date — "2026-10-11" (expected "2026-10-11")
- ✅ midterm|exam|cecc483: time — "08:00" (expected "08:00")
- ❌ midterm|exam|cecc483: end time — empty (expected "13:00")
- ✅ midterm|exam|cecc483: location — "CIT-U Gymnasium"
- ✅ midterm|exam|cecc483: confidence.date — "confirmed" (expected "confirmed")
- ✅ midterm|exam|cecc483: confidence.time — "confirmed" (expected "confirmed")
- ✅ midterm|exam|cecc483: confidence.location — "confirmed" (expected "confirmed")
- ✅ no unrelated coverage section merged into the CECC483 exam without an open question

Validator corrections:
- item 2: combines 2 separate “Coverage” sections

## bundle-english

- ❌ action count — 1 (expected 2)
- ✅ chapter 3: found — Submit Chapter 3
- ✅ chapter 3: type — "deadline" (expected "deadline")
- ✅ chapter 3: date — "2026-10-09" (expected "2026-10-09")
- ❌ chapter 3: time — empty (expected "17:00")
- ❌ consultation: found — missing
- ✅ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

Validator corrections:
- item 1: model date 2026-10-06 corrected to 2026-10-09 for “Friday before 5 PM”

## cebuano-mixed

- ✅ action count — 1 (expected 1)
- ✅ reflection: found — Reflection paper submission
- ✅ reflection: type — "deadline" (expected "deadline")
- ✅ reflection: date — "2026-10-09" (expected "2026-10-09")
- ✅ reflection: time — "17:00" (expected "17:00")
- ✅ no cancelled seminar created as an event to attend

Validator corrections:
- item 1: model date 2026-10-11 corrected to 2026-10-09 for “karong Friday”

## tagalog-mixed

- ✅ action count — 1 (expected 1)
- ✅ quiz|biology: found — Biology quiz
- ❌ quiz|biology: type — "deadline" (expected "event")
- ✅ quiz|biology: date — "2026-10-08" (expected "2026-10-08")
- ❌ quiz|biology: time — empty (expected "10:00")
- ✅ quiz|biology: requirement lab manual — ["Bring lab manual and calculator"]
- ✅ quiz|biology: requirement calculator — ["Bring lab manual and calculator"]
- ✅ no invented location

Validator corrections:
- item 1: model date 2026-10-09 corrected to 2026-10-08 for “Huwebes, 10:00 AM”

## tagalog

- ✅ action count — 1 (expected 1)
- ✅ orientation: found — Orientation
- ✅ orientation: type — "event" (expected "event")
- ✅ orientation: date — empty (expected empty)
- ✅ orientation: time — "15:00" (expected "15:00")
- ✅ orientation: location — "Room 204"
- ✅ orientation: requirement ballpen — ["Bring ballpen","Magdala"]
- ✅ ambiguity on date — ["date: The source says “Bukas ng 3:00 PM”, but when it was originally sent is unclear. Which date did it refer to?"]
- ✅ no “bukas” resolved without a known sending date

Validator corrections:
- item 1: relative date “Bukas ng 3:00 PM” left for review

## voice-exam-reminder

- ❌ action count — 3 (expected 1–2)
- ✅ exam: found — exam
- ✅ exam: type — "event" (expected "event")
- ✅ exam: date — "2026-10-12" (expected "2026-10-12")
- ✅ exam: time — "09:00" (expected "09:00")
- ✅ exam: requirement calculator — ["bring calculator and ID"]
- ✅ exam: requirement \bID\b — ["bring calculator and ID"]
- ✅ no reminder time used as the exam start

Validator corrections:
- item 1: model date 2026-10-13 corrected to 2026-10-12 for “tomorrow”
- item 2: date expression “the next day” is not in the source; ignored
- item 2: model date 2026-10-14 corrected to 2026-10-12 for “tomorrow”
- item 3: date expression “the next day” is not in the source; ignored
- item 3: model date 2026-10-14 corrected to 2026-10-12 for “tomorrow”

## cebuano-inig-udto

- ✅ action count — 1 (expected 1)
- ✅ meeting: found — meeting at the library
- ✅ meeting: type — "event" (expected "event")
- ✅ meeting: date — "2026-10-13" (expected "2026-10-13")
- ❌ meeting: time — empty (expected "12:00")
- ❌ meeting: location — empty
- ❌ meeting: requirement \bID\b — []

Validator corrections:
- item 1: model date 2026-10-12 corrected to 2026-10-13 for “Ugma”

## mixed-moved-to

- ✅ action count — 2 (expected 2)
- ✅ consultation: found — Consultation
- ✅ consultation: type — "event" (expected "event")
- ✅ consultation: date — "2026-10-15" (expected "2026-10-15")
- ✅ consultation: time — "15:00" (expected "15:00")
- ✅ draft: found — Submit draft
- ✅ draft: type — "deadline" (expected "deadline")
- ✅ draft: date — "2026-10-14" (expected "2026-10-14")
- ❌ draft: time — empty (expected "17:00")

Validator corrections:
- item 1: model date 2026-10-12 corrected to 2026-10-14 for “before 5 karong Wednesday”
- item 2 time: cited t1, the only unit stating 15:00
- item 2: model date 2026-10-13 corrected to 2026-10-15 for “Thursday 3 PM”
- item 3 dropped: “Submit lab report” is not grounded in the source

## contextless-correction

- ✅ action count — 1 (expected 0–1)
- ✅ no invented a date for an unidentified meeting

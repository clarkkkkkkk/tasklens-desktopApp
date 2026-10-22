# Local AI evaluation report

- Prompt version: 10
- Model: Qwen3-4B-Q4_K_M.gguf (llama.cpp, CPU)
- Sampling: {"temperature":0,"top_k":1,"top_p":1,"seed":7}
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Server load: 3.8s; prewarm: 0.3; peak RSS: 5327 MiB
- Prompt lookup: disabled
- Run: 2026-10-22T01:18:17.645Z on Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz
- Checks passed: 110/128 across 14 cases
- Suite coverage: 14/14 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| graduation-english | english | 17/17 | 198.4 | 2 |
| graduation-cebuano | cebuano | 17/17 | 205.7 | 2 |
| graduation-tagalog | tagalog | 17/17 | 251.8 | 2 |
| pencil-and-paper | English | 0/1 | 119.7 | 2 |
| pictorial | Cebuano + English | 15/15 | 60.8 | 1 |
| midterm | English | 11/11 | 78.4 | 1 |
| bundle-english | English | 2/8 | 53.8 | 1 |
| cebuano-mixed | Cebuano + English | 2/6 | 84.2 | 1 |
| tagalog-mixed | Tagalog + English | 0/1 | 234.5 | 2 |
| tagalog | Tagalog | 9/9 | 55.7 | 1 |
| voice-exam-reminder | English | 6/8 | 62.3 | 1 |
| cebuano-inig-udto | Cebuano | 6/7 | 96.2 | 1 |
| mixed-moved-to | Cebuano + English | 6/9 | 85.9 | 1 |
| contextless-correction | English | 2/2 | 29.8 | 1 |

## graduation-english

- ✅ action count — 2 (expected 2)
- ✅ holy mass|misa: found — Holy Mass
- ✅ holy mass|misa: type — "event" (expected "event")
- ✅ holy mass|misa: date — empty (expected empty)
- ✅ holy mass|misa: time — "10:00" (expected "10:00")
- ✅ holy mass|misa: end time — "11:00" (expected "11:00")
- ✅ holy mass|misa: location — "San Narciso Parish"
- ✅ holy mass|misa: requirement uniform — ["Reguired outfit for Holy Mass: OJT/Pinning uniform; black trousers or slacks"]
- ✅ holy mass|misa: requirement trousers|slacks — ["Reguired outfit for Holy Mass: OJT/Pinning uniform; black trousers or slacks"]
- ✅ lunch|paniudto|tanghalian: found — LUNCH
- ✅ lunch|paniudto|tanghalian: type — "event" (expected "event")
- ✅ lunch|paniudto|tanghalian: date — empty (expected empty)
- ✅ lunch|paniudto|tanghalian: time — "12:00" (expected "12:00")
- ✅ lunch|paniudto|tanghalian: location — "RTC Gym"
- ✅ ambiguity on date — ["date: Which date does this activity refer to?","date: Which date does this activity refer to?"]
- ✅ no invented date
- ✅ no lost source evidence

## graduation-cebuano

- ✅ action count — 2 (expected 2)
- ✅ holy mass|misa: found — Holy Mass
- ✅ holy mass|misa: type — "event" (expected "event")
- ✅ holy mass|misa: date — empty (expected empty)
- ✅ holy mass|misa: time — "10:00" (expected "10:00")
- ✅ holy mass|misa: end time — "11:00" (expected "11:00")
- ✅ holy mass|misa: location — "San Narciso Parish"
- ✅ holy mass|misa: requirement uniform — ["OJT/Pinning uniform","black trousers or slacks"]
- ✅ holy mass|misa: requirement trousers|slacks — ["OJT/Pinning uniform","black trousers or slacks"]
- ✅ lunch|paniudto|tanghalian: found — Lunch
- ✅ lunch|paniudto|tanghalian: type — "event" (expected "event")
- ✅ lunch|paniudto|tanghalian: date — empty (expected empty)
- ✅ lunch|paniudto|tanghalian: time — "12:00" (expected "12:00")
- ✅ lunch|paniudto|tanghalian: location — "RTC Gym"
- ✅ ambiguity on date — ["date: Which date does this activity refer to?","date: Which date does this activity refer to?"]
- ✅ no invented date
- ✅ no lost source evidence

## graduation-tagalog

- ✅ action count — 2 (expected 2)
- ✅ holy mass|misa: found — Holy Mass
- ✅ holy mass|misa: type — "event" (expected "event")
- ✅ holy mass|misa: date — empty (expected empty)
- ✅ holy mass|misa: time — "10:00" (expected "10:00")
- ✅ holy mass|misa: end time — "11:00" (expected "11:00")
- ✅ holy mass|misa: location — "San Narciso Parish"
- ✅ holy mass|misa: requirement uniform — ["OJT/Pinning uniform","black trousers or slacks"]
- ✅ holy mass|misa: requirement trousers|slacks — ["OJT/Pinning uniform","black trousers or slacks"]
- ✅ lunch|paniudto|tanghalian: found — Lunch
- ✅ lunch|paniudto|tanghalian: type — "event" (expected "event")
- ✅ lunch|paniudto|tanghalian: date — empty (expected empty)
- ✅ lunch|paniudto|tanghalian: time — "12:00" (expected "12:00")
- ✅ lunch|paniudto|tanghalian: location — "RTC Gym"
- ✅ ambiguity on date — ["date: Which date does this activity refer to?","date: Which date does this activity refer to?"]
- ✅ no invented date
- ✅ no lost source evidence

## pencil-and-paper

- ❌ valid output — The explicit calendar date in [t1] was omitted. Preserve the written date; capture metadata does not make an explicit date ambiguous.

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
- ✅ chapter 3: found — Submit Chapter 3 Friday before 5 PM. Consultation is Monday at 2 PM. Bring the revised questionnaire
- ❌ chapter 3: type — "task" (expected "deadline")
- ❌ chapter 3: date — "2026-10-05" (expected "2026-10-09")
- ❌ chapter 3: time — "09:14" (expected "17:00")
- ❌ consultation: found — missing
- ❌ no deadline and consultation merged into one item
- ✅ no deadline time used as consultation time

## cebuano-mixed

- ❌ action count — 2 (expected 1)
- ✅ reflection: found — Submit reflection paper
- ❌ reflection: type — "task" (expected "deadline")
- ✅ reflection: date — "2026-10-09" (expected "2026-10-09")
- ❌ reflection: time — empty (expected "17:00")
- ❌ no cancelled seminar created as an event to attend

Validator corrections:
- item 1: resolved “karong Friday” to 2026-10-09
- item 2: resolved “karong Friday” to 2026-10-09

## tagalog-mixed

- ❌ valid output — The explicit clock time in [r4] was omitted. A missing date does not make a directly stated clock time unknown; keep the time and ask for the date.

Validator corrections:
- item 1: resolved “Huwebes” to 2026-10-08

## tagalog

- ✅ action count — 1 (expected 1)
- ✅ orientation: found — orientation
- ✅ orientation: type — "event" (expected "event")
- ✅ orientation: date — empty (expected empty)
- ✅ orientation: time — "15:00" (expected "15:00")
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
- ✅ exam: requirement calculator — ["bring my calculator","bring my ID"]
- ✅ exam: requirement \bID\b — ["bring my calculator","bring my ID"]
- ✅ no reminder time used as the exam start

Validator corrections:
- item 1: resolved “tomorrow” to 2026-10-12

## cebuano-inig-udto

- ✅ action count — 1 (expected 1)
- ✅ meeting: found — meeting sa library
- ✅ meeting: type — "event" (expected "event")
- ✅ meeting: date — "2026-10-13" (expected "2026-10-13")
- ❌ meeting: time — empty (expected "12:00")
- ✅ meeting: location — "library"
- ✅ meeting: requirement \bID\b — ["Bring ID"]

Validator corrections:
- item 1 arrival time: “udto” converted to 12:00
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

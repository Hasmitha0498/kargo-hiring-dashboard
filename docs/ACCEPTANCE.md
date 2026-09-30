# Acceptance tests

Run on 30 Sep – 1 Oct 2026 against real Supabase, Gemini (`gemini-3.5-flash`) and Resend (TEST MODE), plus `npm test` (52 automated tests).
Test candidates were 7 invented CVs in `sample-cvs/` (never part of calibration; `@example.com` addresses), in PDF, DOCX and TXT, plus a corrupt PDF and a PNG.

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Calibration generates PM + SPM rubric | ✅ | 8 past hires + 2 JDs → draft v1 in 51 s: 3 patterns (ground-level operational immersion, self-initiated fixes others adopted, failure ownership), 5 PM + 5 SPM criteria |
| 2 | PM = 100 %, SPM = 100 %, stored in DB | ✅ | `rubric_criteria` rows; `activate_rubric` refuses other totals (migration test) |
| 3 | New person works | ✅ | 7 new CVs processed end to end (~30 s each) |
| 4 | Role selection | ✅ | 4 PM + 4 SPM uploads; each appears only in its applied-role list |
| 5 | Dual evaluation | ✅ | every candidate has PM and SPM totals; cross-role rank is null |
| 6 | Score + evidence + reasoning per criterion | ✅ | 10 rows per evaluation; absent evidence marked ABSENT; quotes checked against the CV |
| 7 | Weighted calculation | ✅ | recomputed Σ(raw ÷ 4 × weight) matched every stored total |
| 8 | Ranking | ✅ | PM: 91.3 / 83.8 / 11.3 · SPM: 82.5 / 73.8 / 6.3 / 3.8 |
| 9 | Explainability | ✅ | candidate page: criterion, raw, weight, points, verbatim evidence, reasoning, rubric version, model, time |
| 10 | Interview brief | ✅ | why ranked / uncertainty / one specific probe question citing the candidate's own work |
| 11 | Email draft for everyone | ✅ | invite + warm rejection generated for all 7; rubric wording blocked from emails |
| 12 | Override | ✅ | AI suggested Interview, founder chose Reject; both stored; draft switched to rejection |
| 13 | No auto-send | ✅ | send refused with no decision (409), with mismatched type (409), without confirm (400) |
| 14 | Delivery to test inbox | ✅ | Resend id `01a0f3b1-…`; delivered to the test inbox, intended candidate address recorded but not used |
| 15 | Audit of sending | ✅ | `email_events` SENT + provider id + sent_at; candidate → EMAIL_SENT; duplicate blocked (409) |
| 16 | Gemini failure recovery | ✅ | invalid key → candidate kept as AI_FAILED (CV saved), Retry after fixing → scored, READY |
| 17 | Different CVs, no code change | ✅ | 7 CVs, 3 formats, varied profiles (strong, buzzword, prestige, sparse, cross-role) |
| 18 | No runtime comparison with named hires | ✅ | runtime prompt = rubric + identity-free CV only (test); no hire names in source (test) |
| 19 | Rubric versioning | ✅ | v1 → v2 created as a new version; approved rubrics refuse edits (409); replacing needs confirmation (409 without); earlier evaluations kept (3 on record for one candidate) |
| 20 | Security | ✅ | 0 secrets / contact details in the browser bundle; all pages 307 → login and all APIs 401 when signed out; RLS blocks the public key |

## Issues found during live testing, and fixed

1. **Evidence check false alarms**: PDF hard-wraps split words, and one-word evidence was never checked. Fixed: the comparison ignores whitespace, and short evidence is matched as whole words.
2. **Score instability**: the same CV scored 81.2 then 72.5. Fixed: temperature 0, plus scoring rules (use the lower level when unsure; examples illustrate but aren't required; one CV line can support several criteria). Three repeat runs now give identical totals.
3. **Calibration overfit**: the "scrappy problem solving" criterion required "Excel models, weekend prototypes", copied from past hires. Fixed in rubric v2 (founder-approved), and future calibrations are told to describe behaviour, not the tools one person used.
4. **Rubric wording in candidate emails**: a draft said "the kind of operational immersion we value". Fixed: emails that contain criterion names are rejected and regenerated.
5. **Dashboard**: failed uploads inflated counts (now listed separately); evidence was hidden on narrow screens (now shown under the name); dates differed between server and browser (now fixed to IST).

## Open product question

With fewer than 5 applicants in a role, everyone is "top 5", so the AI suggests *Interview* even for a 3.8/100 CV. This follows the brief (top 5 = shortlist recommended). A minimum score for the recommendation is the obvious fix, but it changes product behaviour, so it is left for the founder to decide.

## Round 2 (1 Oct 2026): open access + UX rework, re-tested on production

| Test | Result | Evidence |
|---|---|---|
| E: no password | ✅ | Cookie-less requests: `/` 307 → `/dashboard`; `/dashboard`, `/upload`, `/rubric`, `/activity`, `/calibration`, `/candidates/[id]` all 200; `/login` 404 |
| A: new PM CV (TXT) | ✅ | Sneha Verma: role PM, identity only in the private record, PM 70.0 + SPM 61.3, 5 criteria with evidence and reasoning, ranked #4 in the PM list only; hand-calculated Σ(raw ÷ 4 × weight) = 70.00 = stored |
| B: new SPM CV (DOCX) | ✅ | Vivek Menon: SPM 71.3 (#3 in the SPM list) + PM 83.8 (not ranked in PM); hand calculation 71.25 = stored |
| Ranking | ✅ | Both lists sorted descending; 0 other-role applicants ranked in either list; a 6th PM applicant pushed the lowest scorer out of the top 5 and his suggestion switched to Reject |
| C: Gemini failure | ✅ | Broken key (local only) → candidate saved as AI_FAILED; **Retry Scoring** clicked on the production page → live checklist → scored (PM 66.3, #5), no re-upload |
| D: Resend | ✅ | Send refused before a decision (409) → Interview → Confirm & Send → Resend id `01a0f3d7-…`, delivered to the test inbox, sent_at stored, status EMAIL_SENT, Activity shows decision + "Interview invitation sent", duplicate blocked (409) |
| Secrets | ✅ | Production bundle scan: 0 occurrences of any key or the test inbox address |
| Responsive | ✅ | 1440 / 1024 / 390 px: no horizontal scroll; dashboard switches to cards on mobile |

# Acceptance tests

Status of the 20 acceptance tests from the build brief. "Automated" = covered by `npm test`.
"Live" = run end-to-end against real Supabase + Gemini + Resend.

| # | Test | How verified | Result |
|---|---|---|---|
| 1 | Calibration generates PM + SPM rubric | Live | pending live run |
| 2 | PM = 100%, SPM = 100%, stored in DB | Automated (migration + validate) + Live | automated ✓ |
| 3 | New person (not in calibration) | Live | pending live run |
| 4 | Role selection PM / SPM | Live | pending live run |
| 5 | Dual evaluation | Automated + Live | automated ✓ |
| 6 | Every criterion has score, evidence, reasoning | Automated + Live | automated ✓ |
| 7 | Weighted score calculation | Automated | ✓ |
| 8 | Ranking per applied role | Automated (migration) + Live | automated ✓ |
| 9 | Explainability | Live (candidate page) | pending live run |
| 10 | Interview brief: why / uncertainty / probe | Automated (schema) + Live | automated ✓ |
| 11 | Email draft for every candidate | Live | pending live run |
| 12 | AI suggestion can be overridden | Automated (schema) + Live | automated ✓ |
| 13 | No send before Confirm & Send | Automated | ✓ |
| 14 | Resend delivers to test inbox | Live | pending live run |
| 15 | Sent status recorded | Automated (migration) + Live | automated ✓ |
| 16 | Gemini failure → candidate kept, Retry works | Automated (retry) + Live | automated ✓ |
| 17 | Multiple different CVs, no code change | Live | pending live run |
| 18 | No runtime comparison with named hires | Automated | ✓ |
| 19 | Rubric versioning | Automated (migration) + Live | automated ✓ |
| 20 | No secrets / private data exposed | Automated + Live (bundle scan) | automated ✓ |

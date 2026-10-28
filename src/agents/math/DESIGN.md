# Math Agent: design record

Owner: Gu Haixiang. Written from the September design plan, build plan and reviews, and updated to the state of `main` on 28 October 2026. Current behaviour is described in [README.md](./README.md); measured results are in [runs/](./runs/).

This record keeps the reasoning behind the agent: what it was meant to do, the requirements it was held to, the decisions taken and the alternatives rejected, how quality was gated, and what reviews found. Each claim distinguishes what was **designed**, what was **implemented** and what was **verified**; a prompt instruction is evidence that the instruction exists, not that the behaviour is reliable.

## 1. Purpose and scope

**Student promise.** Help a student understand a concept, work through a problem or find the mistake in their working, using methods suited to their Singapore school level.

**Supported requests:** concept explanation, guided problem solving (hints), full worked solutions on request, checking supplied working, and syllabus or examination-format questions. A short understanding check is part of teaching; quiz sets and flashcards belong to the Testing Agent.

**Excluded from the evaluated scope:** image or handwriting input, formal proof checking, general symbolic algebra, and guarantees of learning gain. University content that a student asks for may be given as enrichment, but it is outside the evaluated scope. The agent does not call other agents, render quizzes, store data or make routing decisions.

**Preparation order (agreed 12 September).** Map the intended courses first (PSLE Standard and Foundation; O-Level 4052 and 4049; H1 8865 and H2 9758, mapped separately), check them against the official MOE and SEAB documents, and only then write topic rules and gold answers. The reference register in [references/](./references/) records the 33 documents behind this, with versions, sources and checksums.

## 2. Proposed shared tutoring contract

Proposed to the team on 10 to 12 September so that the subject agents behave consistently while keeping their own methods. It was a proposal for discussion; the shared tutor rules in `src/agents/_shared/context.ts` remain the team's implemented baseline.

Common workflow: **understand the request, choose an approach, use evidence and tools, explain or guide, then check and adapt.** This is a decision framework, not a fixed sequence of model calls: a clear request for a worked solution does not need a diagnostic question first.

| Shared expectation | Math specialisation |
| --- | --- |
| Understand intent and student context | Distinguish explanation, hint, full solution, checking working and syllabus questions |
| Use methods suited to the band | Choose methods and notation for the student's level |
| Support material claims with evidence | Verify supported calculations; take coverage and examination claims from checked sources |
| Explain clearly and respond to the student | Show working; address the first identifiable error |
| Handle uncertainty and failure honestly | Separate unverified calculations, ambiguous problems and missing evidence |
| Keep continuity and agent boundaries | Use context without inventing mastery or claiming a handoff that did not happen |

Consistency here means shared meanings for context, uncertainty, evidence and outcomes, not identical prompts or tools. The plan also proposed an owner for each cross-cutting concern (routing, context, retrieval, tracing, security, evaluation, operations) so that integration risks were raised before code was written.

### Teaching playbook

| Request or condition | Expected behaviour |
| --- | --- |
| Explain a concept | Name the method, show a suitable example, offer a short check |
| Stuck, or asks for a hint | Give one useful next step; do not give the answer |
| Full solution | Clear working and a final answer, checked against the question |
| Check my working | Identify the first incorrect step and explain why; do not invent unseen steps |
| Missing information | Ask for what changes the solution, or state a reasonable assumption |
| Examination mechanics | Answer from the checked examination facts; never guess marks, timing or calculator rules |
| Unsupported calculation | Work by hand and say so; never claim a verification that did not happen |
| Student challenges a correct answer | Recheck the inputs and evidence; correct a real error, otherwise explain calmly |

## 3. Engineering requirements

Eight requirements, each with the evidence that would show it is met. Status is as of 28 October 2026.

| ID | Requirement | Evidence | Status |
| --- | --- | --- | --- |
| M1 | Conclusions and steps are mathematically correct within scope | Computed, held-out and exam-style evaluation layers | Met |
| M2 | Replies follow the requested teaching mode and grade band | Hint, planted-error and regression cases | Partly met: one hint case and one Primary band case fail |
| M3 | Material calculations are verified | First-step rule; solver tests; tool traces in runs | Partly met: occasional arithmetic between solver calls |
| M4 | Syllabus and examination claims rest on evidence | `examFacts`, syllabus search, end-to-end check | Met in the agent; open at system level because these questions are routed to the concierge |
| M5 | Invalid input and tool failure are handled honestly | Tool refusal tests; fallback behaviour | Met |
| M6 | Specialist boundaries and shared contracts are respected | Own folder; no imports between agents; routing checks | Met |
| M7 | Behaviour is reproducible and changes are traceable | Run records, seeded generators, versioned prompt | Partly met: dated model pin supported but not enabled |
| M8 | Student data and untrusted content are handled safely | Security cases, privacy rule, input guard | Met in the agent; shared gaps in Section 7 |

## 4. Key decisions and alternatives

The governing principle: **code enforces what must not vary; the model handles judgement.**

| Decision | Alternative rejected | Evidence that settled it |
| --- | --- | --- |
| gpt-4o | gpt-4o-mini | 30 of 32 against 21 of 32 on the same cases; Wilson intervals do not overlap |
| Code-forced first tool when the request is unambiguous | Prompt-only tool use | The model skipped verification on word problems despite the instruction; three cases failed until the rule was added |
| `examFacts` lookup table with source and check date | Retrieval from syllabus text | Examination rules are few and exact; the baseline gave wrong calculator and formula-sheet answers |
| mathjs in process, with stated limits | A separate computer algebra service | A service adds hosting and attack surface; hand working covers the gap honestly |
| Graph summary to the model, points to the browser | Full plotted data to the model | With full data the model copied points into its reply; the longest reply fell from 2,030 to 356 tokens |
| Agent inside the shared chat API | A container per agent | A stateless agent with local tools needs no service of its own |
| Code checks plus a model judge | Model judge alone | The judge passed security replies that skipped the working |
| Last step reserved for a written reply | Stop on the step limit | A turn still calling tools on its last step would end with no text for the student |

Tools and agents are added only against an observed failure and a way to measure the benefit. The ablation in `baseline.ts` (plain model, prompt without tools, full agent) is the check on the tools themselves.

## 5. Quality gates

**Merge gates (set 19 September, before the first merge to `main`).** The runtime files waited until each gate closed; documentation could merge earlier.

1. **Tool correctness.** Every reproduced solver defect fixed, or the input class narrowed with an honest refusal.
2. **Repeatable verification.** The ad hoc check script replaced by `tools.test.ts`, run by `npm test` in CI with a failing exit code.
3. **Team CI.** Type check, lint, tests, critical dependency audit and build pass on the merged branch, not on an isolated copy.
4. **Reference truth.** Examination facts checked against the primary SEAB documents before they become shared runtime evidence.
5. **Consistent documentation.** Docs describe implemented behaviour, not plans.

**Definition of done.** The agreed behaviour is implemented, results are reproducible from a recorded revision and configuration, integration expectations are checked, prompt copies are in step, and every remaining limitation has an owner or is an accepted exclusion. A polished demonstration on its own is not evidence.

**Run records.** Every evaluation run records the revision, prompt version, model, settings, per-case results, cost and limitations ([runs/](./runs/)). A baseline was taken before any behaviour change, and the regression set was frozen once it met its bar of 24 of 26.

## 6. Review findings and fixes

**Review of the first build, 12 September.** Every finding was reproduced before it was fixed.

| Priority | Finding | Fix |
| --- | --- | --- |
| P1 | PSLE paper specifications wrong in the shared syllabus corpus (Foundation Paper 1 and Paper 2 totals; a Standard booklet question type) | Corrected against SEAB 0008 and 0038 |
| P1 | The solver returned a root excluded by a denominator, `(x^2-1)/(x-1)=2` giving x = 1 | Candidate roots checked against the original expression |
| P1 | An approximation reported as exact, `0.3333333333334` as 1/3 | Exact values only from rational arithmetic |
| P1 | Linear equations always failed | Dispatch by the real number of coefficients |
| P2 | Undefined results such as `1/0` returned as successes | Returned as failures with a reason |
| P2 | The prompt stated a universal marking rule that the syllabuses contradict | Made conditional on the paper and question |
| P2 | Evaluation cases did not test what they claimed | Checks strengthened; weak cases marked until the scorer improved |

**Follow-up review** found six narrower defects: a scaled equation losing valid roots, complex roots bypassing validation, bigint precision loss, the hole in `x/x` hidden by simplification, a non-finite complex result, and a check script that could not run. The script was replaced by `tools.test.ts`, which now covers the solver reproductions and runs on every pull request.

**How one defect escaped.** The linear case passed in the prototype, then the call was rewritten and the final check list no longer included it: the code changed after the evidence was gathered, and the evidence was not regathered. The fix was procedural as well as technical: checks live in the test suite and run on every pull request, so re-verifying is a command, not an act of memory.

**Gold-answer review, 29 September.** Before tuning, the 26 regression cases were checked against the primary documents. Three gold answers were wrong, three needed a wording or check fix, and nine phrase checks were too weak to fail meaningfully. The corrections are recorded in [runs/2026-09-29-run4.md](./runs/2026-09-29-run4.md). Without this review the agent would have been tuned towards wrong targets.

## 7. Shared-platform observations

Raised with the owners of shared components; Math does not edit shared code directly.

| Observation (12 September) | Status, 28 October |
| --- | --- |
| The chat route flags injection attempts but passes the original message to the specialist, so the filter is not an enforced boundary | Open. Privacy-flagged turns are now sent to the concierge; injection flags are recorded only |
| Generation logs record the router's prompt version, not the specialist's | Open |
| Syllabus ranking could return a section on the grade bonus alone, with no matching term | Resolved: results now require at least one matching term |
| The evaluation runner recorded tool names only from the final step | Resolved: tool names are collected across all steps (arguments and results are still not kept) |

End-to-end checks on the production deployment (21 October) found one further system issue: examination-format and syllabus questions are routed to the general concierge, which answered four of seven incorrectly although the Math Agent holds the correct facts. Routing these questions to the subject agents is the highest-value fix and belongs to the router owner.

## 8. Evaluation principles

- Separate the agent from routing and the user interface, so a failure can be attributed to the right component.
- Gold answers come from primary documents or are computed by code, never by a language model.
- Held-out cases use their own seed and are never used for tuning; after a fix they reveal, the set is redrawn.
- Responses, retrieved text and tool output are untrusted input to the judge; a case passes only when the code check and the judge both pass.
- A single run is not proof of reliability: small layers move by one case between runs, so variation is reported, not hidden.
- The model judge has not been calibrated against human marking; that is the next step for the evaluation, not an assumed property.

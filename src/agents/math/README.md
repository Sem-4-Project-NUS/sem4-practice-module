# Math Agent

**Owner:** Gu Haixiang  
**Folder:** `src/agents/math/`  
**Syllabus corpus:** `data/syllabus/math.md`  
**Results:** [runs/](./runs/) records every evaluation run, from the 29 September baseline onwards.

## Scope

The Math Agent teaches Singapore mathematics at the student's level:

- Primary, including P6 model drawing and problem-solving heuristics
- Secondary O-Level Mathematics (4052) and Additional Mathematics (4049)
- JC H1 (8865) and H2 (9758) Mathematics

It explains concepts, shows working and verifies numerical results. Quizzes and flashcards belong to the Testing Agent: when a student asks for one, the agent suggests asking for a test so that Orchestration routes the request to Testing. It still helps with a question the student pastes in.

The agent is self-contained in this folder and does not import other specialist agents. Changes to shared code (orchestration, chat route, persistence, quiz widgets) go through their owners.

## Files

| File | Purpose |
| --- | --- |
| `prompts.ts` | System prompt. `MATH_PROMPT_VERSION` is raised on every edit. |
| `index.ts` | `createMathAgent`: model, tools, first-step rule, guardrails, step and output limits. |
| `first-step.ts` | Selects the first tool when the request makes it unambiguous. A live examination forces no tool. |
| `step-budget.ts` | Reserves the last of the 8 steps for a written reply (tools off). Bounds model calls, not wall-clock time. |
| `model.ts` | This agent's model (`MATH_MODEL`) and an optional dated snapshot (`MATH_MODEL_SNAPSHOT`). |
| `tools.ts` | `equationSolver` and `drawMathGraph` (mathjs), with the shared input guard. |
| `exam-facts.ts` | `examFacts`: checked SEAB examination-format facts, each with its source and check date. |
| `guardrails.ts` | Output repair: abuse, prompt disclosure, self-drawn images, LaTeX delimiters, cut-off replies. |
| `graph-types.ts`, `math-graph-widget.tsx` | Client rendering of `drawMathGraph` output (JSXGraph). |
| `baseline.ts` | Ablation script: plain model, prompt without tools, and the full agent on the code-scored cases. |
| `*.test.ts` | Unit tests for the modules above. |
| `runs/` | Evaluation run records. |
| `references/` | Register of the official MOE and SEAB documents behind the syllabus and examination facts. |
| `src/evals/catalog/math.ts`, `math-generated.ts` | Hand-written and generated evaluation cases. |
| `langflow/prompts/math.system.md` | Summary of `prompts.ts`; its version must match (tested). |

## Tools

- `equationSolver` checks arithmetic and algebra before a final answer. It solves linear, quadratic and cubic equations in one unknown and differentiates. It cannot integrate symbolically, keep surds exact, or solve simultaneous or trigonometric equations; the agent works these by hand and says so. An integral is checked by differentiating the answer.
- `drawMathGraph` draws y = f(x). The widget receives the plotted points and the model receives only a summary, so the data cannot be copied into the reply.
- `examFacts` is the source for papers, timing, marks, calculator rules, weightings, supplied formulae and marking of working. The facts should be re-checked against SEAB when a new examination year is published, with `EXAM_FACTS_CHECKED_ON` updated.
- `documentSearch` (shared, subject `"math"`) decides whether a topic is in a syllabus.
- `webSearch` (shared) is optional. Syllabus search and examination facts take priority.

A new tool goes in its own file or in `tools.ts` and is registered in `index.ts`. A first-step rule is added only when the trigger is unambiguous and tested with phrasings outside the evaluation set.

## Model

`MATH_MODEL` sets the model for this agent. When unset, it falls back to `OPENAI_MODEL`, then `gpt-4o`. Because `gpt-4o` is an alias that the provider can move, `MATH_MODEL_SNAPSHOT` can pin a dated version of the selected alias, for example `MATH_MODEL=gpt-4o` with `MATH_MODEL_SNAPSHOT=gpt-4o-2024-08-06`, in `.env.local` and in the Vercel project settings. The pin applies only when the selected model is that alias, so evaluation runs on other models are unaffected, and unset or malformed values leave the selected model unchanged. The Math suite should be re-run after the pin is set or changed, with the snapshot recorded in the run note.

## Prompt rules

- Singapore English spelling.
- LaTeX for mathematics (`$...$` / `$$...$$`).
- Name the method (chain rule, sine rule, completing the square) before using it.
- Stay within the student's band; no university content unless the student asks.
- Syllabus coverage comes only from `documentSearch`, and examination rules only from `examFacts`.

## Testing

Unit tests run with the rest of the project (`npm test`). For a manual check, ask the tutor:

- "Differentiate x^2 sin x for H2."
- "What is 3/4 of 12? Show working."
- "Is Maclaurin series in O-Level?" (checks the syllabus and says no)
- "Can I use a calculator in A-Math Paper 1?" (uses the examination facts and says yes)
- "Sketch y = x^2 - 4x + 3" (graph with roots and turning point)

The reply should be labelled **Math** and show the expected tool. The full suite runs from `/evals/scores`; compare the result with the latest record in `runs/`.

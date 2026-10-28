# Physics Agent

**Owner:** Chua Hieng Weih  
**Folder:** `src/agents/physics/`  
**Syllabus corpus:** `data/syllabus/physics.md`

## Job

Teach Singapore physics at the student's band:

- Primary science (forces, energy, light, heat, electricity at intro level)
- O-Level Physics
- JC H1/H2 Physics

For calculations: principle → formula → substitution with **units** → answer. Conceptual and clarification replies use the relevant explanation without unnecessary calculation headings.

## Files you may change

| File | Purpose |
| --- | --- |
| `prompts.ts` | System prompt. Bump `PHYSICS_PROMPT_VERSION` on every edit. |
| `tools.ts` | `formulaLookup`, `unitConverter`, bounded `calculatePhysics`, and structured `drawPhysicsDiagram`. |
| `index.ts` | `createPhysicsAgent` wiring. |
| `diagram-types.ts` | Physics-owned serialisable diagram contracts. |
| `physics-diagram-widget.tsx` | Lazy client renderer for Physics diagrams. |
| `physics-diagram-widget.module.css` | Styles scoped to the diagram widget. |
| `data/syllabus/physics.md` | Curriculum map for RAG. |
| `langflow/prompts/physics.system.md` | Keep in sync with `prompts.ts`. |
| `run-evals.ts` | Serial Physics-only evaluation against the Git catalogue, with local run evidence. |
| `eval-phrases.ts` | Physics-only equivalent vocabulary used by the code evaluator. |
| `eval-output.ts` | Collects all student-visible Physics tool-loop prose for evaluation. |
| `runs/` | Technical validation records and diagram QA screenshots. |

## Tools you must keep

- `formulaLookup` — school formulas (SUVAT, F=ma, Ohm, waves, thin lens, …)
- `unitConverter` — convert via SI (km/h ↔ m/s, °C ↔ K, etc.)
- `calculatePhysics` — verify numerical substitutions locally with bounded arithmetic; this does not choose the physical equation or establish syllabus coverage
- `drawPhysicsDiagram` — validated free-body, piecewise-linear motion graph, or real-image converging-lens diagram rendered with JSXGraph
- `documentSearch` — shared tool with subject `"physics"`
- `webSearch` — optional stub; syllabus first

When adding formulas, extend the `FORMULAS` list in `tools.ts`. When adding units, extend `TO_SI`. Do not call an external units API unless the team agrees.

## Files you must not change

- Other specialist agent folders
- Testing agent quiz tools
- Shared types unless the whole team agrees (`src/agents/_shared/types.ts`)

## Prompt rules

- SI units and significant figures on numeric answers.
- Call out common Singapore exam traps (missing units, scalar vs vector). Use the specified lens convention and distinguish extension algebra from the 6091 ray-diagram outcomes.
- `g ≈ 9.81 m/s^2` unless the question says 10 m/s^2.
- Stay inside the grade band.
- Draw only supported diagrams when requested or materially useful; use supplied or derived values and never invent missing measurements.

## How to test

Ask the desk:

- "Convert 72 km/h to m/s and show working."
- "A 2 kg mass accelerates at 3 m/s^2. Find the force."
- "Is quantum physics in O-Level or A-Level?"

Confirm the stamp says **Physics** and that formula / unit tools run when a number is required.
Also ask "Draw a free-body diagram of a block with weight, normal force and a push to the right" and confirm an inline Physics diagram appears.

## Lightweight safeguards (v1.3.0)

The three components are labelled in `prompts.ts` and `guardrails.ts`:

- Safety Filtering: contextual safety instructions plus a small output filter for obvious abuse and selected dangerous electrical instructions. Safety warnings remain allowed.
- Policy Enforcement: prompt rules require English, grade-band fit, academic integrity, Physics scope, and resistance to instructions embedded in student context. Language and topic compliance remain model-dependent.
- Consistency & Reliability: a short calculation format, local LaTeX/whitespace repair, an incomplete-text fallback, and an explicit no-match result from formula lookup.
- Diagram inputs use bounded Zod schemas and fixed JSXGraph templates. The model cannot send raw SVG or JavaScript to the browser.

`index.ts` applies the checks to Physics only. Text blocks are held until complete before display, so filtering works across streamed chunks. Tools continue to stream; there are no additional model calls, semantic judges, or regeneration loops. This is a limited backstop, not comprehensive moderation or factual validation.

Run local checks with `node_modules/.bin/tsx --test src/agents/physics/guardrails.test.ts`.

## Wrap-up evaluation workflow

The prompt is now `1.3.6`, with its Langflow copy synchronised. Calculation requests start with formula lookup rather than treating a written `m/s` unit as a conversion request. A graph described in a calculation does not itself request a diagram. Course-specific coverage starts with syllabus search. The prompt requires numerical substitutions to be checked with `calculatePhysics`, shows conversion working, and asks for missing quantities or course identity.

Run all Physics-owned regression checks with:

```bash
node --import tsx --test src/agents/physics/*.test.ts
```

Run the 100 source-catalogue examples with both the Code scaffold and Physics LLM judge enabled:

```bash
node --import tsx src/agents/physics/run-evals.ts --label=review
```

Use a new label for each run; existing evidence is not overwritten. The runner reads provider settings from `.env.local`, runs serially with pacing and rate-limit retries, writes item-level evidence under `logs/physics-<Singapore-date>-<label>.json`, and saves completed runs to the existing eval history. It intentionally uses the Git catalogue rather than local dataset overrides. `--only=id1,id2` is available for focused retests. Recorded latency, token usage and estimated cost cover the tutor calls; the existing judge API does not include its usage in those totals.

Physics's judge distinguishes calculations from conceptual/clarification replies and checks tools from actual call records. Its evaluated text includes all tool-loop prose, matching the working and answer shown in the student stream. Earlier errors are retained, not selectively discarded. The code evaluator accepts equivalent vocabulary such as “net force towards the centre” and “inward resultant”; the LLM judge still checks the factual contract. Other suites retain their text capture, phrase matching and judge rules.

Historical validation records and diagram QA screenshots are retained locally under `runs/`. These records are separate from fresh GitHub Actions results for the committed source.

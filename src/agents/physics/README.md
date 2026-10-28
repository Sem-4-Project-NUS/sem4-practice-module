# Physics Agent

**Owner:** Chua Hieng Weih  
**Folder:** `src/agents/physics/`  
**Syllabus corpus:** `data/syllabus/physics.md`

## Overview

The Physics Agent teaches Singapore physics at the student's grade band:

- Primary science (forces, energy, light, heat, electricity at intro level)
- O-Level Physics
- JC H1/H2 Physics

Calculation replies follow principle → formula → substitution with **units** → answer. Conceptual and clarification replies use the relevant explanation without unnecessary calculation headings.

## Implementation

| File | Purpose |
| --- | --- |
| `prompts.ts` | Teaching instructions, course clarification and `PHYSICS_PROMPT_VERSION`. |
| `tools.ts` | `formulaLookup`, `unitConverter`, bounded `calculatePhysics`, and structured `drawPhysicsDiagram`. |
| `index.ts` | `createPhysicsAgent` wiring. |
| `diagram-types.ts` | Physics-owned serialisable diagram contracts. |
| `physics-diagram-widget.tsx` | Lazy client renderer for Physics diagrams. |
| `physics-diagram-widget.module.css` | Styles scoped to the diagram widget. |
| `data/syllabus/physics.md` | Curriculum map for RAG. |
| `langflow/prompts/physics.system.md` | Langflow copy of the teaching prompt. |
| `run-evals.ts` | Serial Physics-only evaluation against the Git catalogue, with local run evidence. |
| `eval-phrases.ts` | Physics-only equivalent vocabulary used by the code evaluator. |
| `eval-output.ts` | Collects all student-visible Physics tool-loop prose for evaluation. |

Paths outside this folder are relative to the repository root. Prompt revisions are tracked by `PHYSICS_PROMPT_VERSION`, with a corresponding copy in `langflow/prompts/physics.system.md`.

## Tools

- `formulaLookup` — school formulas (SUVAT, F=ma, Ohm, waves, thin lens, …)
- `unitConverter` — convert via SI (km/h ↔ m/s, °C ↔ K, etc.)
- `calculatePhysics` — verify numerical substitutions locally with bounded arithmetic; this does not choose the physical equation or establish syllabus coverage
- `drawPhysicsDiagram` — validated free-body, piecewise-linear motion graph, or real-image converging-lens diagram rendered with JSXGraph
- `documentSearch` — shared tool with subject `"physics"`
- `webSearch` — optional stub; syllabus first

Formula lookup uses the `FORMULAS` list in `tools.ts`, and unit conversion uses the local `TO_SI` table.

## Integration

The chat route selects Physics for teaching requests. Physics uses shared runtime types from `src/agents/_shared/types.ts` and shared retrieval tools, with no imports from other specialists. Quiz and flashcard generation belong to the Testing Agent.

## Teaching behaviour

- Numerical answers include SI units and appropriate significant figures.
- Explanations address common Singapore exam traps, including missing units, scalar/vector confusion and lens sign conventions. Lens explanations distinguish extension algebra from the 6091 ray-diagram outcomes.
- The default gravitational acceleration is `g ≈ 9.81 m/s^2`, unless the question specifies 10 m/s^2.
- Content is limited to the student's grade band. Course-dependent JC syllabus questions require H1/H2 and syllabus-code clarification when these are missing.
- Diagrams use supported templates and supplied or derived values. Ambiguous requests or missing measurements lead to clarification.

## Manual checks

Example requests in the student desk:

- "Convert 72 km/h to m/s and show working."
- "A 2 kg mass accelerates at 3 m/s^2. Find the force."
- "Is quantum physics in O-Level or A-Level?"

Expected behaviour includes the **Physics** stamp and formula lookup or unit conversion for the corresponding requests.
The request "Draw a free-body diagram of a block with weight, normal force and a push to the right" should produce an inline Physics diagram.

## Lightweight safeguards (v1.3.0)

The three components are labelled in `prompts.ts` and `guardrails.ts`:

- Safety Filtering: contextual safety instructions plus a small output filter for obvious abuse and selected dangerous electrical instructions. Safety warnings remain allowed.
- Policy Enforcement: prompt rules require English, grade-band fit, academic integrity, Physics scope, and resistance to instructions embedded in student context. Language and topic compliance remain model-dependent.
- Consistency & Reliability: a short calculation format, local LaTeX/whitespace repair, an incomplete-text fallback, and an explicit no-match result from formula lookup.
- Diagram inputs use bounded Zod schemas and fixed JSXGraph templates. The model cannot send raw SVG or JavaScript to the browser.

`index.ts` applies the checks to Physics only. Text blocks are held until complete before display, so filtering works across streamed chunks. Tools continue to stream; there are no additional model calls, semantic judges, or regeneration loops. This is a limited backstop, not comprehensive moderation or factual validation.

Run local checks with `node_modules/.bin/tsx --test src/agents/physics/guardrails.test.ts`.

## Evaluation

Prompt version `1.3.6` starts calculation requests with formula lookup and verifies numerical substitutions with `calculatePhysics`. Unit conversions show their working. Course-specific coverage starts with syllabus search, with clarification for missing quantities or course identity. Written units or graph descriptions in a calculation do not by themselves trigger conversion or drawing tools.

Run all Physics-owned regression checks with:

```bash
node --import tsx --test src/agents/physics/*.test.ts
```

Run the 100 source-catalogue examples with both the Code scaffold and Physics LLM judge enabled:

```bash
node --import tsx src/agents/physics/run-evals.ts --label=review
```

Each run requires a unique label to preserve existing results. The runner reads provider settings from `.env.local`, runs serially with pacing and rate-limit retries, writes item-level results under `logs/physics-<Singapore-date>-<label>.json`, and saves completed runs to the existing eval history. It uses the Git catalogue rather than local dataset overrides. `--only=id1,id2` selects cases for focused retests. Recorded latency, token usage and estimated cost cover the tutor calls; the existing judge API does not include its usage in those totals.

Physics's judge distinguishes calculations from conceptual/clarification replies and checks tools from actual call records. Its evaluated text includes all tool-loop prose, matching the working and answer shown in the student stream. Earlier errors are retained, not selectively discarded. The code evaluator accepts equivalent vocabulary such as “net force towards the centre” and “inward resultant”; the LLM judge still checks the factual contract. Other suites retain their text capture, phrase matching and judge rules.

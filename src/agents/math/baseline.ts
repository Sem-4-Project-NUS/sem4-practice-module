// Ablation baseline for the Math agent report.
//
// Runs the 30 generated cases with code-computed answers (computed, held-out and
// exam style) under three conditions, with the same model, the same cases and
// the same literal answer check the eval suite uses (case-insensitive mustInclude):
//   A. plain model: the student's question only, no system prompt, no tools
//   B. the Math system prompt, but no tools and no guardrails
//   C. the full Math agent: prompt, tools, first-step rule and guardrails
// A to B measures the prompt; B to C measures the tools and code controls.
// Each condition reports passes with a Wilson 95% interval, and each pair an
// exact McNemar test on the cases where the two conditions differ, so a small
// or mixed difference is reported as inconclusive rather than as a gain.
//
// Run from the repo root on a machine with OPENAI_API_KEY in .env.local:
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json src/agents/math/baseline.ts
// Add --dry-run to list the cases without calling the API. All three
// conditions use the Math model (MATH_MODEL, else OPENAI_MODEL).

import { writeFileSync, mkdirSync } from "node:fs";
import { generateText } from "ai";
import { getMathModel, mathModelId } from "./model";
import { buildComputedItems, buildExamItems, buildHoldoutItems } from "@/evals/catalog/math-generated";
import type { EvalItem } from "@/evals/types";
import type { AgentRuntimeContext } from "../_shared/types";
import { createMathAgent, MATH_MAX_OUTPUT_TOKENS } from "./index";
import { buildMathInstructions } from "./prompts";

type Condition = "A" | "B" | "C";
const CONDITIONS: Condition[] = ["A", "B", "C"];
const LABELS: Record<Condition, string> = {
  A: "A: plain model",
  B: "B: Math prompt, no tools",
  C: "C: full Math agent",
};

const items: EvalItem[] = [...buildComputedItems(), ...buildHoldoutItems(), ...buildExamItems()];
const dryRun = process.argv.includes("--dry-run");

function layerOf(id: string) {
  if (id.startsWith("math-holdout-exam-")) return "held-out exam style";
  if (id.startsWith("math-holdout-")) return "held-out";
  if (id.startsWith("math-gen-exam-")) return "exam style";
  return "computed";
}

function passes(item: EvalItem, text: string) {
  const lower = text.toLowerCase();
  return (item.scaffold.mustInclude ?? []).every((phrase) => lower.includes(phrase.toLowerCase()));
}

function context(item: EvalItem): AgentRuntimeContext {
  return { sessionId: "baseline", profile: item.profile, recentChats: [] } as AgentRuntimeContext;
}

async function runCondition(condition: Condition, item: EvalItem) {
  const started = Date.now();
  let text: string;
  let modelId: string | undefined;
  let tools: string[] = [];
  if (condition === "C") {
    const result = await createMathAgent(context(item)).generate({ prompt: item.prompt });
    text = result.text;
    modelId = result.response.modelId;
    tools = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
  } else {
    const system = condition === "B" ? buildMathInstructions(context(item)) : undefined;
    const result = await generateText({
      model: getMathModel(),
      system,
      prompt: item.prompt,
      temperature: 0.2,
      maxOutputTokens: MATH_MAX_OUTPUT_TOKENS,
    });
    text = result.text;
    modelId = result.response.modelId;
  }
  return {
    condition,
    id: item.id,
    layer: layerOf(item.id),
    expected: item.scaffold.mustInclude ?? [],
    passed: passes(item, text),
    modelId,
    tools,
    latencyMs: Date.now() - started,
    reply: text,
  };
}

type Row = Awaited<ReturnType<typeof runCondition>>;

function wilson(passed: number, n: number) {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = passed / n;
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// Exact two-sided McNemar test: of the cases where the two conditions differ,
// how surprising is the split if neither condition is better?
function mcnemar(rows: Row[], first: Condition, second: Condition) {
  let firstOnly = 0;
  let secondOnly = 0;
  for (const item of items) {
    const a = rows.find((r) => r.condition === first && r.id === item.id)?.passed;
    const b = rows.find((r) => r.condition === second && r.id === item.id)?.passed;
    if (a && !b) firstOnly += 1;
    if (!a && b) secondOnly += 1;
  }
  const n = firstOnly + secondOnly;
  const k = Math.min(firstOnly, secondOnly);
  let tail = 0;
  for (let i = 0; i <= k; i += 1) tail += choose(n, i) / 2 ** n;
  return { firstOnly, secondOnly, p: n === 0 ? 1 : Math.min(1, 2 * tail) };
}

function choose(n: number, k: number) {
  let value = 1;
  for (let i = 1; i <= k; i += 1) value = (value * (n - k + i)) / i;
  return value;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

async function main() {
  console.log(`${items.length} cases, selected model ${mathModelId()}`);
  if (dryRun) {
    for (const item of items) console.log(`${layerOf(item.id).padEnd(20)} ${item.id}  expects ${JSON.stringify(item.scaffold.mustInclude)}`);
    return;
  }
  const rows: Row[] = [];
  for (const condition of CONDITIONS) {
    for (const item of items) {
      const row = await runCondition(condition, item);
      rows.push(row);
      console.log(`${condition} ${row.passed ? "PASS" : "FAIL"} ${row.id}${row.tools.length ? ` [${row.tools.join(", ")}]` : ""}`);
    }
  }

  const layers = [...new Set(rows.map((r) => r.layer))];
  const lines = [`| Layer | Cases | ${CONDITIONS.map((c) => LABELS[c]).join(" | ")} |`, `|---|---|${CONDITIONS.map(() => "---").join("|")}|`];
  for (const layer of [...layers, "total"]) {
    const pick = (c: Condition) => rows.filter((r) => r.condition === c && (layer === "total" || r.layer === layer));
    lines.push(`| ${layer} | ${pick("A").length} | ${CONDITIONS.map((c) => pick(c).filter((r) => r.passed).length).join(" | ")} |`);
  }
  for (const c of CONDITIONS) {
    const set = rows.filter((r) => r.condition === c);
    const passed = set.filter((r) => r.passed).length;
    const [low, high] = wilson(passed, set.length);
    lines.push(`\n${LABELS[c]}: ${passed}/${set.length}, Wilson 95% interval ${pct(low)} to ${pct(high)}`);
  }
  for (const [first, second] of [["A", "B"], ["B", "C"], ["A", "C"]] as const) {
    const { firstOnly, secondOnly, p } = mcnemar(rows, first, second);
    const verdict = p < 0.05 ? "difference unlikely to be chance" : "inconclusive";
    lines.push(`${first} vs ${second}: only ${first} passed ${firstOnly}, only ${second} passed ${secondOnly}, exact McNemar p = ${p.toFixed(3)} (${verdict})`);
  }
  const served = [...new Set(rows.map((r) => r.modelId).filter(Boolean))];
  lines.push(`\nModel version reported by the provider: ${served.join(", ") || "not reported"}`);
  console.log("\n" + lines.join("\n"));

  mkdirSync("logs", { recursive: true });
  const file = `logs/math-baseline-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({ selectedModel: getModelId(), servedModels: served, at: new Date().toISOString(), rows }, null, 2));
  console.log(`\nSaved ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

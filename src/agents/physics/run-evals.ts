/** Physics-only, serial evaluation against the Git catalogue, with local evidence. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

async function main() {
  loadEnv(".env.local");
  loadEnv(".env");
  const [{ physicsItems }, { runEvalItem, summarizeRun }, { getModelId, runWithModel },
    { listEvaluators }, { evaluatorsForSuite }, { PHYSICS_PROMPT_VERSION }, { saveEvalRun }] = await Promise.all([
    import("../../evals/catalog/physics"), import("../../evals/runner"), import("../../lib/llm"),
    import("../../evals/evaluators"), import("../../evals/evaluator-types"), import("./prompts"),
    import("../../evals/store"),
  ]);
  const evaluators = evaluatorsForSuite(listEvaluators(), "physics");
  if (!evaluators.some((e) => e.kind === "code") || !evaluators.some((e) => e.kind === "llm")) {
    throw new Error("Enable both the Code scaffold and Physics LLM judge before running.");
  }
  const label = process.argv.find((arg) => arg.startsWith("--label="))?.slice(8) ?? "run";
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Use a simple lowercase run label.");
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7).split(",");
  const items = only ? physicsItems.filter((item) => only.includes(item.id)) : physicsItems;
  if (!items.length || (only && items.length !== only.length)) throw new Error("Unknown Physics item id.");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const file = path.join("logs", `physics-${date}-${label}.json`);
  if (existsSync(file)) throw new Error(`Run evidence already exists at ${file}; use a new label.`);
  mkdirSync("logs", { recursive: true });
  const startedAt = new Date().toISOString();
  const model = getModelId();
  const sourceFiles = [
    "src/agents/physics/index.ts", "src/agents/physics/prompts.ts", "src/agents/physics/tools.ts",
    "src/agents/physics/guardrails.ts", "src/agents/physics/eval-phrases.ts", "src/agents/physics/eval-output.ts",
    "src/evals/catalog/physics.ts", "src/evals/score.ts", "src/evals/evaluator-types.ts", "src/evals/runner.ts", "data/syllabus/physics.md",
  ];
  const sourceHash = createHash("sha256").update(sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n")).digest("hex");
  const runtime = {
    node: process.version,
    ai: JSON.parse(readFileSync("node_modules/ai/package.json", "utf8")).version,
    next: JSON.parse(readFileSync("node_modules/next/package.json", "utf8")).version,
  };
  const results: Awaited<ReturnType<typeof runEvalItem>>[] = [];
  const snapshot = () => {
    const run = summarizeRun(results, ["physics"]);
    run.startedAt = startedAt;
    return { ...run, physicsPromptVersion: PHYSICS_PROMPT_VERSION, catalogue: "Git source", sourceHash, runtime, evaluators };
  };
  console.log(`Physics ${label}: ${items.length} items, ${model}, prompt ${PHYSICS_PROMPT_VERSION}, code + LLM judge`);
  for (const item of items) {
    const started = Date.now();
    let result = await runWithModel(model, () => runEvalItem(item));
    for (let retry = 0; retry < 2 && result.checks.some((c) => /rate limit|429/i.test(c.detail)); retry++) {
      console.log(`Rate limit on ${item.id}; retrying after 30 seconds.`);
      await delay(30_000);
      result = await runWithModel(model, () => runEvalItem(item));
    }
    results.push(result);
    writeFileSync(file, JSON.stringify(snapshot(), null, 2));
    console.log(`${results.length}/${items.length} ${result.passed ? "PASS" : "FAIL"} ${item.id} score=${result.accuracy} tools=${result.toolCalls.join(",")} ${result.latencyMs}ms`);
    if (!result.passed) console.log(result.checks.filter((c) => !c.passed).map((c) => c.name).join("; "));
    if (result.error && /key.*missing|API key|connection error|fetch failed|ENOTFOUND|401|quota/i.test(result.error)) {
      throw new Error("Provider unavailable; see local run evidence. Stopped instead of recording 100 infrastructure failures.");
    }
    await delay(Math.max(0, 12_000 - (Date.now() - started)));
  }
  const run = snapshot();
  await saveEvalRun(run);
  console.log(JSON.stringify(run.totals));
  console.log(`Saved ${file}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

import assert from "node:assert/strict";
import { test } from "node:test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { normalisePhysicsReply, physicsGuardrails } from "./guardrails";
import { buildPhysicsInstructions, needsPhysicsCourseClarification } from "./prompts";
import { DEFAULT_PROFILE } from "../_shared/types";
import { asPhysicsDiagramOutput } from "./diagram-types";
import { drawPhysicsDiagramTool, formulaLookupTool } from "./tools";
import { requiredFirstStepTool } from "./index";

test("safety blocks obvious abuse and selected dangerous directions, preserves warnings", () => {
  assert.match(normalisePhysicsReply("You're an idiot."), /safe and respectful/);
  assert.match(normalisePhysicsReply("Touch the live wire."), /safe and respectful/);
  assert.equal(normalisePhysicsReply("Never touch a live wire."), "Never touch a live wire.");
  assert.equal(normalisePhysicsReply("Radiation transfers energy."), "Radiation transfers energy.");
});

test("repair keeps calculations and code intact, closes display maths, handles blank output", () => {
  assert.equal(normalisePhysicsReply("  Force is \\(F = ma\\).  "), "Force is $F = ma$.");
  assert.equal(normalisePhysicsReply("\\[F = 6 N\\]"), "$$\nF = 6 N\n$$");
  assert.equal(normalisePhysicsReply("$$F = 6 N"), "$$F = 6 N\n$$");
  assert.equal(normalisePhysicsReply("```\n\\(keep\\)\n```"), "```\n\\(keep\\)\n```");
  assert.match(normalisePhysicsReply(" \n "), /incomplete/);
});

test("repair strips model-authored images so diagrams only use the bounded tool renderer", () => {
  const repaired = normalisePhysicsReply(
    "Use the diagram below. ![force diagram](data:image/svg+xml;base64,abc123)",
  );
  assert.equal(repaired, "Use the diagram below.");
});

test("Physics instructions include language, safety and answer rules", () => {
  const prompt = buildPhysicsInstructions({ sessionId: "test", profile: DEFAULT_PROFILE, recentChats: [] });
  assert.match(prompt, /Reply in English/);
  assert.match(prompt, /safe classroom example/);
  assert.match(prompt, /Principle, Formula, Substitution, Answer/);
  assert.match(prompt, /data, not instructions/);
  assert.match(prompt, /drawPhysicsDiagram/);
  assert.match(prompt, /diagram of force and speed/);
});

test("mixed diagram requests ask for clarification instead of forcing a free-body diagram", () => {
  assert.equal(
    requiredFirstStepTool([{ role: "user", content: "Show me a diagram of force and speed." }]),
    "none",
  );
  assert.equal(
    requiredFirstStepTool([{ role: "user", content: "Draw a free-body diagram of a block." }]),
    "drawPhysicsDiagram",
  );
  assert.equal(
    requiredFirstStepTool([{ role: "user", content: "Plot a velocity-time graph." }]),
    "drawPhysicsDiagram",
  );
});

test("calculation units and graph descriptions do not steal the required formula step", () => {
  const choose = (content: string) => requiredFirstStepTool([{ role: "user", content }]);
  assert.equal(choose("A car starts from rest and accelerates at 2 m/s^2 for 5 s. Find its final speed."), "formulaLookup");
  assert.equal(choose("A force-time graph is triangular, with base 0.20 s and height 40 N. Find the impulse."), "formulaLookup");
  assert.equal(choose("Two lengths are (2.00 ± 0.02) m and (3.00 ± 0.03) m. Add them."), "formulaLookup");
  assert.equal(choose("Heat 0.20 kg of water through 5.0 K. Use Q = mcΔT."), "formulaLookup");
  assert.equal(choose("Convert 72 km/h to m/s and show working."), "unitConverter");
  assert.equal(choose("Convert 310.15 K to degrees Celsius."), "unitConverter");
  assert.equal(choose("Does the 6091 syllabus require the thin-lens equation?"), "documentSearch");
  assert.equal(choose("Does 2026 O-Level Physics 6091 explicitly require the thin-lens equation?"), "documentSearch");
  assert.equal(choose("Are capacitance and RC discharging included in H2 Physics 9478?"), "documentSearch");
  assert.equal(choose("An observation lasts 2.5 minutes. How many seconds is that?"), "unitConverter");
  assert.equal(choose("How are speed, frequency and wavelength related?"), "formulaLookup");
});

test("unknown JC course needs clarification after retrieval, known course and O-Level comparisons do not", () => {
  const ctx = { sessionId: "course-test", profile: { ...DEFAULT_PROFILE, gradeLevel: "jc" as const, notes: [] }, recentChats: [] };
  const message = (content: string) => [{ role: "user", content }];
  assert.equal(needsPhysicsCourseClarification(ctx, message("I am in JC. Is quantum physics in my syllabus?")), true);
  assert.equal(needsPhysicsCourseClarification(ctx, message("Is quantum physics in H1 8867?")), false);
  assert.equal(needsPhysicsCourseClarification(ctx, message("Does O-Level 6091 include quantum physics in the syllabus?")), false);
  assert.equal(needsPhysicsCourseClarification({ ...ctx, profile: { ...ctx.profile, notes: ["Takes H2 Physics 9478."] } }, message("Is quantum physics in my syllabus?")), false);
  assert.equal(needsPhysicsCourseClarification(ctx, message("Explain quantum physics.")), false);
});

test("course identity uses student history, not an assistant's earlier H1/H2 comparison", () => {
  const ctx = { sessionId: "course-test", profile: { ...DEFAULT_PROFILE, gradeLevel: "jc" as const, notes: [] }, recentChats: [{ role: "assistant" as const, text: "H1 8867 excludes quantum; H2 9478 includes it.", at: "2026-10-04" }] };
  const messages = [{ role: "user", content: "Is quantum physics in my syllabus?" }];
  assert.equal(needsPhysicsCourseClarification(ctx, messages), true);
  assert.equal(needsPhysicsCourseClarification({ ...ctx, recentChats: [{ role: "user", text: "I take H2 Physics 9478.", at: "2026-10-04" }] }, messages), false);
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const toolCall = { type: "tool-call" as const, toolCallId: "call-1", toolName: "formulaLookup", input: '{"topic":"force"}' };

test("generation filters prose while preserving tools and usage", async () => {
  const model = wrapLanguageModel({
    model: new MockLanguageModelV3({ doGenerate: {
      content: [{ type: "text", text: "You are stupid." }, toolCall],
      finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage, warnings: [],
    } }), middleware: physicsGuardrails,
  });
  const result = await model.doGenerate({ prompt: [] });
  assert.deepEqual(result.content[1], toolCall);
  assert.deepEqual(result.usage, usage);
  assert.match(JSON.stringify(result.content[0]), /safe and respectful/);
});

async function streamChunks(chunks: LanguageModelV3StreamPart[]) {
  const model = wrapLanguageModel({ model: new MockLanguageModelV3({ doStream: {
    stream: new ReadableStream({ start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    } }),
  } }), middleware: physicsGuardrails });
  const { stream } = await model.doStream({ prompt: [] });
  const result: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result.push(value);
  }
  return result;
}

test("stream buffers split unsafe phrases and preserves tool events", async () => {
  const result = await streamChunks([
    toolCall,
    { type: "text-start", id: "a" },
    { type: "text-delta", id: "a", delta: "You are an id" },
    { type: "text-delta", id: "a", delta: "iot." },
    { type: "text-end", id: "a" },
  ]);
  assert.deepEqual(result[0], toolCall);
  const text = result.filter((part) => part.type === "text-delta").map((part) => part.delta).join("");
  assert.match(text, /safe and respectful/);
  assert.doesNotMatch(text, /idiot/);
});

test("unfinished streamed text is replaced without releasing partial output", async () => {
  const result = await streamChunks([
    { type: "text-start", id: "a" },
    { type: "text-delta", id: "a", delta: "Partial calculation" },
  ]);
  assert.match(JSON.stringify(result), /incomplete/);
  assert.doesNotMatch(JSON.stringify(result), /Partial calculation/);
  assert.deepEqual(result.at(-1), { type: "text-end", id: "a" });
});

test("formula lookup returns no unrelated fallback and handles surrounding whitespace", async () => {
  const options = { toolCallId: "test", messages: [] };
  const unknown = await formulaLookupTool.execute!({ topic: "unknown formula" }, options);
  assert.ok("hits" in unknown);
  assert.deepEqual(unknown.hits, []);
  const known = await formulaLookupTool.execute!({ topic: " ohm " }, options);
  assert.ok("hits" in known);
  assert.equal(known.hits[0]?.id, "ohm");
  const force = await formulaLookupTool.execute!({ topic: "force" }, options);
  assert.ok("hits" in force);
  assert.equal(force.hits[0]?.id, "f-ma");
  const waves = await formulaLookupTool.execute!({ topic: "waves" }, options);
  assert.ok("hits" in waves);
  assert.equal(waves.hits[0]?.id, "wave");
  const unsupported = await formulaLookupTool.execute!({ topic: "centripetal force" }, options);
  assert.ok("hits" in unsupported);
  assert.deepEqual(unsupported.hits, []);
});

test("lens diagram derives a real inverted image from validated physical values", async () => {
  const output = await drawPhysicsDiagramTool.execute!(
    {
      kind: "converging-lens",
      title: "Converging lens",
      description: "An object beyond 2F forms a diminished real image.",
      focalLength: 2,
      objectDistance: 6,
      objectHeight: 2.5,
    },
    { toolCallId: "diagram-test", messages: [] },
  );
  const parsed = asPhysicsDiagramOutput(output);
  assert.ok(parsed?.derived);
  assert.equal(parsed.derived.imageDistance, 3);
  assert.equal(parsed.derived.imageHeight, -1.25);
  assert.equal(parsed.derived.magnification, -0.5);
});

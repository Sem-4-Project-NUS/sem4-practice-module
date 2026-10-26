import assert from "node:assert/strict";
import { test } from "node:test";
import { MockLanguageModelV3 } from "ai/test";
import type { AgentRuntimeContext } from "../_shared/types";
import { createMathAgent } from "./index";
import { isFinalStep, MATH_MAX_STEPS } from "./step-budget";

const ctx: AgentRuntimeContext = {
  sessionId: "math-step-budget-test",
  profile: { name: "Alex", gradeLevel: "secondary", diagnostic: {}, notes: [] },
  recentChats: [],
};

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

/**
 * A model that keeps asking for the solver whenever tools are allowed, the
 * worst case for the step limit, and writes text only when tools are off.
 */
function toolHungryModel(seen: Array<string | undefined>) {
  let call = 0;
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      call += 1;
      seen.push(options.toolChoice?.type);
      if (options.toolChoice?.type === "none") {
        return {
          content: [{ type: "text", text: "I could not finish checking this within the turn, so this answer is unchecked." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        };
      }
      return {
        content: [
          {
            type: "tool-call",
            toolCallId: `call-${call}`,
            toolName: "equationSolver",
            input: JSON.stringify({ expression: "x^2 - 4 = 0", mode: "solve" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage,
        warnings: [],
      };
    },
  });
}

test("only the last permitted step is reserved", () => {
  for (let step = 0; step < MATH_MAX_STEPS - 1; step += 1) assert.equal(isFinalStep(step), false, String(step));
  assert.equal(isFinalStep(MATH_MAX_STEPS - 1), true);
});

test("a turn that keeps calling tools still ends with a written reply on the last step", async () => {
  const seen: Array<string | undefined> = [];
  const agent = createMathAgent(ctx, { model: toolHungryModel(seen) });
  const result = await agent.generate({ prompt: "Solve x^2 - 4 = 0" });

  assert.equal(result.steps.length, MATH_MAX_STEPS);
  // Step 0 is forced to the solver by the first-step rule, the middle steps are
  // free, and only the last step has tools switched off.
  assert.equal(seen[0], "tool");
  assert.deepEqual(seen.slice(1, -1), Array(MATH_MAX_STEPS - 2).fill("auto"));
  assert.equal(seen.at(-1), "none");
  assert.equal(result.steps.at(-1)?.toolCalls.length, 0);
  assert.match(result.text, /unchecked/);
});

test("a normal turn is unchanged: tool, then answer, and the reserve never applies", async () => {
  const seen: Array<string | undefined> = [];
  let call = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      call += 1;
      seen.push(options.toolChoice?.type);
      return call === 1
        ? {
            content: [{ type: "tool-call", toolCallId: "c1", toolName: "equationSolver", input: JSON.stringify({ expression: "x^2 - 4 = 0", mode: "solve" }) }],
            finishReason: { unified: "tool-calls", raw: "tool_calls" },
            usage,
            warnings: [],
          }
        : { content: [{ type: "text", text: "x = -2 or x = 2" }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] };
    },
  });
  const result = await createMathAgent(ctx, { model }).generate({ prompt: "Solve x^2 - 4 = 0" });
  assert.equal(result.steps.length, 2);
  assert.deepEqual(seen, ["tool", "auto"]);
  assert.equal(result.text, "x = -2 or x = 2");
});

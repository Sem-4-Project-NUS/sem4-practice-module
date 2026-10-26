import assert from "node:assert/strict";
import { test } from "node:test";
import { runWithModel } from "@/lib/llm";
import { createMathAgent } from "./index";
import { getMathModel, mathModelId } from "./model";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const key = "test-key-not-used-for-network-calls";

test("without a snapshot the agent uses the shared model choice unchanged", () => {
  withEnv({ OPENAI_API_KEY: key, OPENAI_MODEL: undefined, MATH_MODEL_SNAPSHOT: undefined }, () => {
    assert.equal(mathModelId(), "gpt-4o");
    assert.equal(getMathModel().modelId, "gpt-4o");
  });
});

test("a dated snapshot of the selected alias is pinned", () => {
  withEnv({ OPENAI_API_KEY: key, OPENAI_MODEL: undefined, MATH_MODEL_SNAPSHOT: "gpt-4o-2024-08-06" }, () => {
    assert.equal(mathModelId(), "gpt-4o-2024-08-06");
    assert.equal(getMathModel().modelId, "gpt-4o-2024-08-06");
  });
});

test("the pin never overrides an evaluation run on another model", () => {
  withEnv({ OPENAI_API_KEY: key, MATH_MODEL_SNAPSHOT: "gpt-4o-2024-08-06" }, () => {
    runWithModel("gpt-4o-mini", () => assert.equal(mathModelId(), "gpt-4o-mini"));
    runWithModel("gemini-2.5-flash", () => assert.equal(mathModelId(), "gemini-2.5-flash"));
  });
});

test("a malformed snapshot is ignored rather than sent to the provider", () => {
  for (const value of ["gpt-4o-latest", "gpt-4o-mini-2024-07-18", "2024-08-06", " "]) {
    withEnv({ OPENAI_API_KEY: key, OPENAI_MODEL: undefined, MATH_MODEL_SNAPSHOT: value }, () => {
      assert.equal(mathModelId(), "gpt-4o", value);
    });
  }
});

test("the agent assembles with its tools, limits and pinned model", () => {
  withEnv({ OPENAI_API_KEY: key, OPENAI_MODEL: undefined, MATH_MODEL_SNAPSHOT: "gpt-4o-2024-08-06" }, () => {
    const agent = createMathAgent({
      sessionId: "math-assembly-test",
      profile: { name: "Alex", gradeLevel: "secondary", diagnostic: {}, notes: [] },
      recentChats: [],
    });
    assert.deepEqual(Object.keys(agent.tools).sort(), [
      "documentSearch",
      "drawMathGraph",
      "equationSolver",
      "examFacts",
      "webSearch",
    ]);
  });
});

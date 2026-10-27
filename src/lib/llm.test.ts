import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_MODEL_ENV, getAgentModel, getAgentModelId, runWithModel } from "./llm";

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
const cleared = Object.fromEntries(
  Object.values(AGENT_MODEL_ENV).map((name) => [name, undefined]),
) as Record<string, string | undefined>;

test("each agent uses its own model, then OPENAI_MODEL, then gpt-4o", () => {
  withEnv({ ...cleared, OPENAI_API_KEY: key, OPENAI_MODEL: undefined }, () => {
    assert.equal(getAgentModelId("physics"), "gpt-4o");
    assert.equal(getAgentModel("chemistry").modelId, "gpt-4o");
  });

  withEnv({ ...cleared, OPENAI_API_KEY: key, OPENAI_MODEL: "gpt-4o-mini" }, () => {
    assert.equal(getAgentModelId("testing"), "gpt-4o-mini");
  });

  withEnv(
    {
      ...cleared,
      OPENAI_API_KEY: key,
      OPENAI_MODEL: "gpt-4o",
      ORCHESTRATION_MODEL: "gpt-4.1-mini",
      MATH_MODEL: "gpt-4.1",
      PHYSICS_MODEL: "gpt-4o-mini",
      CHEMISTRY_MODEL: '"gpt-4o"',
      TESTING_MODEL: "gpt-4.1-mini",
    },
    () => {
      assert.equal(getAgentModelId("orchestration"), "gpt-4.1-mini");
      assert.equal(getAgentModelId("math"), "gpt-4.1");
      assert.equal(getAgentModel("physics").modelId, "gpt-4o-mini");
      assert.equal(getAgentModelId("chemistry"), "gpt-4o");
      assert.equal(getAgentModelId("testing"), "gpt-4.1-mini");
    },
  );
});

test("a known Gemini id uses the Google provider", () => {
  withEnv(
    {
      ...cleared,
      OPENAI_API_KEY: key,
      GOOGLE_GENERATIVE_AI_API_KEY: key,
      PHYSICS_MODEL: "gemini-2.5-flash",
    },
    () => {
      assert.equal(getAgentModel("physics").provider, "google.generative-ai");
      assert.equal(getAgentModel("physics").modelId, "gemini-2.5-flash");
    },
  );
});

test("an evaluation model overrides every agent variable", () => {
  withEnv({ ...cleared, OPENAI_API_KEY: key, MATH_MODEL: "gpt-4.1", PHYSICS_MODEL: "gpt-4o-mini" }, () => {
    runWithModel("gemini-2.5-flash", () => {
      assert.equal(getAgentModelId("math"), "gemini-2.5-flash");
      assert.equal(getAgentModelId("physics"), "gemini-2.5-flash");
    });
  });
});

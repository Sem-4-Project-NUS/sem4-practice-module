import assert from "node:assert/strict";
import { test } from "node:test";
import { physicsEvalReply } from "./eval-output";

test("Physics evaluation retains working before a calculator call and the final answer once", () => {
  const working = "Principle: ideal gas law. Formula: pV = nRT. Substitution: 1 * 8.31 * 300 / 0.0250.";
  const answer = "Answer: 9.97 × 10^4 Pa.";
  assert.equal(physicsEvalReply({ text: answer, steps: [{ text: "" }, { text: working }, { text: answer }] }), `${working}\n\n${answer}`);
});

test("Physics evaluation preserves earlier contradictory prose and falls back when step text is absent", () => {
  assert.equal(physicsEvalReply({ text: "Final", steps: [{ text: "Earlier wrong value" }, { text: "Final" }] }), "Earlier wrong value\n\nFinal");
  assert.equal(physicsEvalReply({ text: "Fallback", steps: [{ text: "" }] }), "Fallback");
  assert.equal(physicsEvalReply({}), "");
});

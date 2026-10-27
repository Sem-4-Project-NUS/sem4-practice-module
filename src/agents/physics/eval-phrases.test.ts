import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreAgainstScaffold } from "../../evals/score";
import { physicsItems } from "../../evals/catalog/physics";

test("Physics accepts equivalent inward-resultant terminology without changing other suites", () => {
  const item = physicsItems.find((row) => row.id === "physics-faq-jc-centripetal-force")!;
  const actualText = "Centripetal force is the net force towards the centre, provided by tension or gravity.";
  assert.equal(scoreAgainstScaffold({ item, actualText, toolCalls: [] }).passed, true);
  assert.equal(scoreAgainstScaffold({ item: { ...item, suiteId: "chemistry" }, actualText, toolCalls: [] }).passed, false);
  assert.equal(scoreAgainstScaffold({ item, actualText: "There is an outward force.", toolCalls: [] }).passed, false);
});

test("Physics vocabulary aliases do not relax formula-tool checks", () => {
  const item = physicsItems.find((row) => row.id === "physics-076-centripetal-acceleration")!;
  const actualText = "The acceleration is 12 m/s² inward.";
  const missing = scoreAgainstScaffold({ item, actualText, toolCalls: [] });
  assert.equal(missing.passed, false);
  assert.equal(scoreAgainstScaffold({ item, actualText, toolCalls: ["formulaLookup"] }).passed, true);
});

test("terminal-velocity checks accept gravity and no acceleration as equivalent terminology", () => {
  const item = physicsItems.find((row) => row.id === "physics-066-terminal-velocity-and-balanced-forces")!;
  const actualText = "The downward force of gravity balances air resistance: no net force and no acceleration, while the object falls at constant velocity.";
  const scored = scoreAgainstScaffold({ item, actualText, toolCalls: [] });
  assert.ok(scored.checks.every((check) => check.passed));
});

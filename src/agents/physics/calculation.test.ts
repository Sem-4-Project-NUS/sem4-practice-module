import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePhysicsTool, formulaLookupTool } from "./tools";

const options = { toolCallId: "arithmetic-test", messages: [] };

test("capacitance and ideal-gas lookups return the governing equation for numerical verification", async () => {
  for (const [topic, expression] of [["capacitance", "C = Q / V"], ["ideal gas", "pV = nRT"], ["gas law", "pV = nRT"]]) {
    const result = await formulaLookupTool.execute!({ topic }, options);
    assert.ok("hits" in result);
    assert.ok(result.hits.some((row) => row.expression === expression));
  }
});

async function calculate(expression: string) {
  const result = await calculatePhysicsTool.execute!({ expression }, options);
  assert.ok("ok" in result);
  return result;
}

test("numerical verification catches the ideal-gas factor-of-ten error and handles scientific notation", async () => {
  const gas = await calculate("1.00 * 8.31 * 300 / 0.0250");
  assert.equal(gas.ok, true);
  assert.equal(gas.value, 99720);
  const photon = await calculate("6.63e-34 * 5.00e14");
  assert.equal(photon.ok, true);
  assert.ok(Math.abs(photon.value! / 3.315e-19 - 1) < 1e-12);
  const signed = await calculate("-(4.0^2) * 0.050");
  assert.equal(signed.value, -0.8);
});

test("numerical verification rejects executable syntax, symbols and non-finite results", async () => {
  for (const expression of ["import('fs')", "a = 2", "e^2", "1/0", "0/0", "(-1)^0.5", "1e999", "1".repeat(201)]) {
    const result = await calculate(expression);
    assert.equal(result.ok, false, expression);
  }
});

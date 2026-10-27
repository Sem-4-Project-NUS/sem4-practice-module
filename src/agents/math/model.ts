import { openai } from "@ai-sdk/openai";
import { getAgentModel, getAgentModelId, requireProviderKey } from "@/lib/llm";

/**
 * Optional dated snapshot for the Mathematics agent only.
 *
 * "gpt-4o" is an alias that the provider can move to a newer snapshot, which
 * would change behaviour without any change in this repository. Setting
 * MATH_MODEL_SNAPSHOT to a dated version of the alias in use (for example
 * gpt-4o-2024-08-06) pins it. The selected model is MATH_MODEL, then
 * OPENAI_MODEL, then gpt-4o. The pin applies only when that model is the
 * snapshot's alias, so an evaluation run on another model is unaffected, and
 * when the variable is unset or malformed the agent uses the selected model.
 */
const DATED_SNAPSHOT = /^(?<alias>[a-z0-9.-]+?)-\d{4}-\d{2}-\d{2}$/;

export function mathModelId() {
  const selected = getAgentModelId("math");
  const pinned = process.env.MATH_MODEL_SNAPSHOT?.trim() ?? "";
  const alias = DATED_SNAPSHOT.exec(pinned)?.groups?.alias;
  return alias && alias === selected ? pinned : selected;
}

export function getMathModel() {
  const id = mathModelId();
  if (id === getAgentModelId("math")) return getAgentModel("math");
  requireProviderKey(getAgentModelId("math"));
  return openai(id);
}

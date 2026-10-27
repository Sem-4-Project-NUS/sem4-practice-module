/** Match the visible Physics stream: prose from every tool-loop step. */
export function physicsEvalReply(result: { text?: string; steps?: Array<{ text?: string }> }) {
  const texts = (result.steps ?? []).map((step) => step.text ?? "").filter((text) => text.trim());
  return texts.length ? texts.join("\n\n") : result.text ?? "";
}

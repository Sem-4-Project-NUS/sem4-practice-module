import { ToolLoopAgent, stepCountIs, wrapLanguageModel } from "ai";
import { documentSearchTool, webSearchTool } from "../_shared/tools";
import type { AgentRuntimeContext } from "../_shared/types";
import { buildMathInstructions, MATH_PROMPT_VERSION } from "./prompts";
import { examFactsTool } from "./exam-facts";
import { requiredFirstStepTool } from "./first-step";
import { drawMathGraphTool, equationSolverTool } from "./tools";
import { mathGuardrails } from "./guardrails";
import { getMathModel } from "./model";
import { isFinalStep, MATH_MAX_STEPS } from "./step-budget";

/**
 * Output cap per step. The longest normal reply in the 2026-09-29 baseline was
 * 364 tokens; the one runaway (a self-drawn graph) reached 16,414. 2,000 leaves
 * room for a long multi-part worked solution while bounding cost, and the
 * guardrail tells the student when a reply was cut short.
 */
export const MATH_MAX_OUTPUT_TOKENS = 2000;

/** `model` is for tests only; the chat route passes just the context. */
export function createMathAgent(ctx: AgentRuntimeContext, options: { model?: Parameters<typeof wrapLanguageModel>[0]["model"] } = {}) {
  return new ToolLoopAgent({
    id: "math",
    model: wrapLanguageModel({ model: options.model ?? getMathModel(), middleware: mathGuardrails }),
    instructions: buildMathInstructions(ctx),
    tools: {
      equationSolver: equationSolverTool,
      drawMathGraph: drawMathGraphTool,
      documentSearch: documentSearchTool("math"),
      examFacts: examFactsTool,
      webSearch: webSearchTool,
    },
    prepareStep: ({ stepNumber, messages }) => {
      if (isFinalStep(stepNumber)) return { toolChoice: "none" };
      if (stepNumber !== 0) return {};
      const toolName = requiredFirstStepTool(messages);
      return toolName ? { toolChoice: { type: "tool", toolName } } : {};
    },
    stopWhen: stepCountIs(MATH_MAX_STEPS),
    maxOutputTokens: MATH_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
  });
}

export const mathMeta = {
  id: "math" as const,
  owner: "Gu Haixiang",
  promptVersion: MATH_PROMPT_VERSION,
};

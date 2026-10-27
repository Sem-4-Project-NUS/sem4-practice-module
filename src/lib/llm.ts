import { AsyncLocalStorage } from "node:async_hooks";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { DEFAULT_EVAL_MODEL_ID, findEvalModel, resolveEvalModel } from "./models";

const modelStore = new AsyncLocalStorage<string>();

/** Chat models. Unset falls back to OPENAI_MODEL, then gpt-4o. */
export const AGENT_MODEL_ENV = {
  orchestration: "ORCHESTRATION_MODEL",
  math: "MATH_MODEL",
  physics: "PHYSICS_MODEL",
  chemistry: "CHEMISTRY_MODEL",
  testing: "TESTING_MODEL",
} as const;

export type TutorAgentId = keyof typeof AGENT_MODEL_ENV;

function readEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return "";
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  const prefix = `${name}=`;
  if (value.startsWith(prefix)) {
    value = value.slice(prefix.length).trim();
  }
  return value;
}

export function runWithModel<T>(modelId: string, fn: () => T): T {
  return modelStore.run(resolveEvalModel(modelId).id, fn);
}

export function getModelId() {
  return modelStore.getStore() ?? (readEnv("OPENAI_MODEL") || DEFAULT_EVAL_MODEL_ID);
}

/** Model for one tutor agent. An eval run's model overrides the agent variable. */
export function getAgentModelId(agent: TutorAgentId) {
  return modelStore.getStore() ?? (readEnv(AGENT_MODEL_ENV[agent]) || getModelId());
}

function googleApiKey() {
  return (
    readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ||
    readEnv("GEMINI_API_KEY") ||
    readEnv("GOOGLE_API_KEY")
  );
}

export function requireProviderKey(modelId: string) {
  const spec = resolveEvalModel(modelId);
  if (spec.provider === "google") {
    const key = googleApiKey();
    if (!key) {
      throw new Error(
        "A Gemini key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY in .env.local.",
      );
    }
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = key;
    return spec;
  }
  const key = readEnv("OPENAI_API_KEY");
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is missing. Copy .env.example to .env.local and add your key.",
    );
  }
  process.env.OPENAI_API_KEY = key;
  return spec;
}

function languageModel(id: string) {
  const spec = findEvalModel(id);
  if (spec?.provider === "google") {
    requireProviderKey(spec.id);
    return google(spec.id);
  }
  requireProviderKey(spec?.id ?? "gpt-4o");
  return openai(id);
}

export function getModel() {
  return languageModel(getModelId());
}

export function getAgentModel(agent: TutorAgentId) {
  return languageModel(getAgentModelId(agent));
}

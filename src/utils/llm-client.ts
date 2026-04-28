/**
 * Shared LLM client factory — src/utils/llm-client.ts
 *
 * Resolves the configured provider in priority order:
 *   Requesty → OpenRouter → OpenAI → Ollama
 *
 * Returns an OpenAI-compatible client + model string.
 */

import OpenAI from "openai";

export interface LLMClient {
  client: OpenAI;
  model: string;
  provider: string;
}

export function createLLMClient(modelEnvOverride?: string): LLMClient {
  if (process.env.REQUESTY_API_KEY) {
    return {
      client: new OpenAI({
        baseURL: "https://router.requesty.ai/v1",
        apiKey: process.env.REQUESTY_API_KEY,
      }),
      model: modelEnvOverride ?? process.env.REQUESTY_MODEL ?? "openai/gpt-5.4-nano",
      provider: "Requesty",
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      client: new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
      }),
      model: modelEnvOverride ?? process.env.OPENROUTER_MODEL ?? "qwen/qwen3-coder:free",
      provider: "OpenRouter",
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      }),
      model: modelEnvOverride ?? process.env.OPENAI_MODEL ?? "gpt-5.4-nano",
      provider: "OpenAI",
    };
  }

  if (process.env.OLLAMA_MODEL) {
    return {
      client: new OpenAI({
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
        apiKey: "ollama",
      }),
      model: process.env.OLLAMA_MODEL,
      provider: "Ollama",
    };
  }

  throw new Error(
    "No LLM configured. Set one of: REQUESTY_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or OLLAMA_MODEL.",
  );
}

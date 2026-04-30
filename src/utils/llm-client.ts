/**
 * LLM client factory.
 *
 * Uses the OpenAI SDK directly. Supports any OpenAI-compatible backend.
 */

import OpenAI from "openai";

export interface LLMClient {
  client: OpenAI;
  model: string;
}

export function createLLMClient(): LLMClient {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_CHAT_MODEL) {
    throw new Error("OPENAI_API_KEY or OPENAI_CHAT_MODEL is not set.");
  }
  return {
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
    }),
    model: process.env.OPENAI_CHAT_MODEL,
  };
}

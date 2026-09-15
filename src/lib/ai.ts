import { createOpenAI } from '@ai-sdk/openai';
import OpenAI from 'openai';

export function openAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export type AiChatModel = {
  model: ReturnType<ReturnType<typeof createOpenAI>['chat']>;
  provider: 'openai' | 'gemini';
  modelId: string;
};

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
}

/**
 * The model for AI chat and the kit planner: OpenAI or Google Gemini, whichever
 * key the shop has.
 *
 * Both features only knew OpenAI, so a shop running on a Gemini key (from
 * Google AI Studio) had no AI at all. Gemini is reached through its
 * OpenAI-compatible endpoint with the SDK already installed, so the callers
 * stay the same. AI_PROVIDER=gemini prefers Gemini when both keys are set.
 */
export function aiChatModel(): AiChatModel | null {
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const gemini = geminiKey();
  const preferGemini =
    String(process.env.AI_PROVIDER || '')
      .trim()
      .toLowerCase() === 'gemini';
  if (openaiKey && !(preferGemini && gemini)) {
    const modelId = process.env.OPENAI_MODEL || 'gpt-5-mini';
    return { model: createOpenAI({ apiKey: openaiKey }).chat(modelId), provider: 'openai', modelId };
  }
  if (gemini) {
    const modelId = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const client = createOpenAI({
      apiKey: gemini,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    });
    return { model: client.chat(modelId), provider: 'gemini', modelId };
  }
  return null;
}

/** Whether any AI provider is configured (OpenAI or Gemini). */
export function aiConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim() || geminiKey());
}

export function aiSdkOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

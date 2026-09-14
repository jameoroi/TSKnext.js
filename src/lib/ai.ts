import { createOpenAI } from '@ai-sdk/openai';
import OpenAI from 'openai';

export function openAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function aiSdkOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

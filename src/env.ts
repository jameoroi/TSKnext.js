import { z } from 'zod';

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_SECRET_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  MEILISEARCH_HOST: z.string().url().optional().or(z.literal('')),
  OPENAI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
});

export const env = serverSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  REDIS_URL: process.env.REDIS_URL,
  MEILISEARCH_HOST: process.env.MEILISEARCH_HOST,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  AUTH_SECRET: process.env.AUTH_SECRET,
});

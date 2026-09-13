import { NextResponse } from 'next/server';
import { redisConfigStatus, redisHealth } from '@/lib/redis';
import { searchClient } from '@/lib/search';
import { databaseConfigured } from '@/server/db/client';




export const dynamic = 'force-dynamic';




export async function GET() {
  const redis = await redisHealth();
  const services = {
    database: databaseConfigured(),
    catalogDualWrite: process.env.CATALOG_TABLE_DUAL_WRITE === '1',
    commerceApi: databaseConfigured() || Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    commerceStorage:
      process.env.COMMERCE_STORAGE ||
      (databaseConfigured() ? 'postgres' : process.env.SUPABASE_URL ? 'supabase' : 'not-configured'),
    redis: redis.reachable,
    meilisearch: Boolean(searchClient()),
    ai: Boolean(process.env.OPENAI_API_KEY),
    kitQuote: Boolean(process.env.KIT_QUOTE_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    objectStorage: Boolean(
      ((process.env.MEDIA_S3_ENDPOINT || process.env.S3_ENDPOINT) &&
        (process.env.MEDIA_BUCKET || process.env.S3_BUCKET)) ||
        (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    ),
    email: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
  };
  return NextResponse.json(
    {
      ok: services.database || services.commerceApi,
      app: 'thaiserkit-supply-next',
      appVersion: '6.0.0',
      next: '16.3.4',
      services,
      redis,
      redisConfig: redisConfigStatus(),
      build:


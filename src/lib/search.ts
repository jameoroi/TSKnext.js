import { MeiliSearch } from 'meilisearch';

let client: MeiliSearch | null | undefined;

export function searchClient() {
  if (client !== undefined) return client;
  const host = process.env.MEILISEARCH_HOST;
  if (!host) return (client = null);
  client = new MeiliSearch({ host, apiKey: process.env.MEILISEARCH_API_KEY });
  return client;
}

export const PRODUCT_INDEX = process.env.MEILISEARCH_PRODUCT_INDEX || 'products';

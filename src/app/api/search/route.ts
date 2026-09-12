import { NextRequest, NextResponse } from 'next/server';
import { searchClient, PRODUCT_INDEX } from '@/lib/search';
import { getProducts } from '@/server/catalog';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json({ ok: false, error: 'query_too_short' }, { status: 422 });
  const client = searchClient();
  if (client) {
    try {
      const result = await client.index(PRODUCT_INDEX).search(q, { limit: 24, attributesToHighlight: ['name', 'brand', 'sku'] });
      return NextResponse.json({ ok: true, engine: 'meilisearch', products: result.hits, processing_time_ms: result.processingTimeMs });
    } catch (error) {
      console.error('[search] meilisearch fallback', error);
    }
  }
  const data = await getProducts({ q, page: 1, per_page: 24 });
  return NextResponse.json({ ok: true, engine: 'postgres-or-commerce-api', products: data.products || [] });
}

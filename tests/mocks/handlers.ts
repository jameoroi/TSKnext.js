import { HttpResponse, http } from 'msw';
export const handlers = [
  http.get('/api', ({ request }) => {
    const u = new URL(request.url);
    if (u.searchParams.get('action') === 'products.list')
      return HttpResponse.json({ ok: true, products: [], total: 0 });
    return HttpResponse.json({ ok: true });
  }),
];

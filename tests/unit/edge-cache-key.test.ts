import { describe, expect, it } from 'vitest';
import { isMediaKey } from '@/shared/media-key.mjs';
import {
  cacheable,
  cacheKeyUrl,
  lastGoodObjectKey,
  staticAssetPaths,
  versionedKey,
} from '../../cloudflare/edge-cache-key.mjs';

const get = (url: string, headers: Record<string, string> = {}) => ({
  request: { method: 'GET', headers: new Headers(headers) },
  url: new URL(url),
});

describe('edge cache key', () => {
  it('ignores query parameters a page does not read, so random URLs cannot force renders', () => {
    const plain = cacheKeyUrl(new URL('https://jayxtsk.shop/')).toString();
    expect(cacheKeyUrl(new URL('https://jayxtsk.shop/?x=12345')).toString()).toBe(plain);
    expect(cacheKeyUrl(new URL('https://jayxtsk.shop/?utm_source=fb&fbclid=abc')).toString()).toBe(plain);
    expect(cacheKeyUrl(new URL('https://jayxtsk.shop/products/dw4811?gclid=1&v=2')).toString()).toBe(
      'https://jayxtsk.shop/products/dw4811',
    );
  });

  it('keeps the filters the catalogue reads, in a stable order', () => {
    const a = cacheKeyUrl(new URL('https://jayxtsk.shop/products?sort=price&q=saw&junk=1&page=2'));
    const b = cacheKeyUrl(new URL('https://jayxtsk.shop/products?page=2&q=saw&sort=price'));
    expect(a.toString()).toBe(b.toString());
    expect(a.searchParams.get('q')).toBe('saw');
    expect(a.searchParams.has('junk')).toBe(false);
    expect(cacheKeyUrl(new URL('https://jayxtsk.shop/brands?q=dewalt&x=1')).search).toBe('?q=dewalt');
  });

  it('keeps API parameters except click identifiers', () => {
    const key = cacheKeyUrl(
      new URL('https://jayxtsk.shop/api?v=3&action=site.settings&compact=1&utm_medium=x'),
    );
    expect(key.search).toBe('?action=site.settings&compact=1&v=3');
  });

  it('only caches anonymous GETs of public pages, sitemap and robots', () => {
    for (const path of ['/', '/products', '/products/abc', '/brands', '/sitemap.xml', '/robots.txt']) {
      const { request, url } = get(`https://jayxtsk.shop${path}`);
      expect(cacheable(request, url)).toBe(true);
    }
    for (const path of ['/cart', '/checkout', '/account', '/admin', '/api?action=products.list']) {
      const { request, url } = get(`https://jayxtsk.shop${path}`);
      expect(cacheable(request, url)).toBe(false);
    }
    const signedIn = get('https://jayxtsk.shop/', { cookie: 'tsk_session=abc' });
    expect(cacheable(signedIn.request, signedIn.url)).toBe(false);
    const authjs = get('https://jayxtsk.shop/', { cookie: '__Secure-authjs.session-token=abc' });
    expect(cacheable(authjs.request, authjs.url)).toBe(false);
    const referral = get('https://jayxtsk.shop/?ref=agent1');
    expect(cacheable(referral.request, referral.url)).toBe(false);
  });

  it('stores last-good copies under a key /media can never serve', async () => {
    const key = await lastGoodObjectKey('https://jayxtsk.shop/');
    expect(key).toMatch(/^_edge\/v1\/[0-9a-f]{64}$/);
    expect(isMediaKey(key)).toBe(false);
  });

  it('scopes cached pages to the deployment, so old HTML never meets new scripts', async () => {
    const page = cacheKeyUrl(new URL('https://jayxtsk.shop/products?brand=DeWalt&x=1'));
    const a = versionedKey(page, 'deploy-a');
    const b = versionedKey(page, 'deploy-b');
    expect(a.toString()).not.toBe(b.toString());
    expect(a.searchParams.get('brand')).toBe('DeWalt');
    expect(await lastGoodObjectKey(a)).not.toBe(await lastGoodObjectKey(b));
    // Without version metadata (local preview) the key is unchanged.
    expect(versionedKey(page, undefined).toString()).toBe(page.toString());
  });

  it('lists the build assets a cached page needs, so an old copy is only served when they still exist', () => {
    const html =
      '<link rel="stylesheet" href="/_next/static/css/b9f75f59a9510a5f.css" data-precedence="next"/>' +
      '<script src="/_next/static/chunks/webpack-5d3efd48950ca4ef.js" async=""></script>' +
      '<script src="/_next/static/chunks/app/layout-2a9cecd172d3a219.js?dpl=abc" async=""></script>' +
      '<link rel="preload" href="/_next/static/media/25f7d470e08d7a87-s.p.woff2" as="font"/>' +
      '<script>self.__next_f.push([1,"\\"/_next/static/chunks/274-834c0f0723a9e516.js\\""])</script>' +
      '<script src="/_next/static/chunks/webpack-5d3efd48950ca4ef.js"></script>' +
      '<img src="/media/product/x.webp"/>';
    expect(staticAssetPaths(html)).toEqual([
      '/_next/static/css/b9f75f59a9510a5f.css',
      '/_next/static/chunks/webpack-5d3efd48950ca4ef.js',
      '/_next/static/chunks/app/layout-2a9cecd172d3a219.js',
      '/_next/static/media/25f7d470e08d7a87-s.p.woff2',
      '/_next/static/chunks/274-834c0f0723a9e516.js',
    ]);
    expect(staticAssetPaths('<p>no assets</p>')).toEqual([]);
  });
});

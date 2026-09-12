import 'server-only';

import { revalidateTag } from 'next/cache';

const PUBLIC_MUTATION_PREFIXES = [
  'admin.products.',
  'admin.categories.',
  'admin.brands.',
  'admin.content.',
  'admin.theme.',
  'reviews.',
];

const PUBLIC_MUTATION_ACTIONS = new Set([
  'admin.site.settings',
  'business.settings.save',
]);

export function actionChangesPublicStorefront(action: string) {
  return PUBLIC_MUTATION_ACTIONS.has(action) || PUBLIC_MUTATION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

export function revalidatePublicStorefront(action: string) {
  if (!actionChangesPublicStorefront(action)) return false;
  // Next.js 16's `max` profile serves stale content while refreshing it in the
  // background. Admin writes stay fast without leaving catalogue/content stale.
  revalidateTag('legacy-public', 'max');
  return true;
}

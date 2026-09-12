import { PostHog } from 'posthog-node';

let serverClient: PostHog | null | undefined;

export function posthogServer() {
  if (serverClient !== undefined) return serverClient;
  const key = process.env.POSTHOG_API_KEY || process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return (serverClient = null);
  serverClient = new PostHog(key, { host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com' });
  return serverClient;
}

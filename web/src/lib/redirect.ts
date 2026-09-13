export const DEFAULT_AFTER_LOGIN = '/listings';

/**
 * The page to return to after logging in, taken from `?next=`. Only same-site
 * paths are allowed, so a crafted login link can't forward someone to another site.
 */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/')) return DEFAULT_AFTER_LOGIN;
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_AFTER_LOGIN;
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) {
    return DEFAULT_AFTER_LOGIN;
  }
  return next;
}

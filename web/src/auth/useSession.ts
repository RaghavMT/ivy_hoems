import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../lib/api';
import { msUntilRefresh, type Session } from '../lib/session';
import { sessionStore } from '../lib/sessionStore';

export function useSession(): Session | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => null);
}

/**
 * Refreshes the access token a minute before it expires while a tab is open, so the
 * app keeps working however long someone leaves it idle. Requests also refresh on
 * demand, which covers tabs whose timers the browser paused.
 */
export function useSessionKeepAlive(): void {
  const session = useSession();

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      api()
        .refresh()
        .catch(() => {
          // A rejected refresh token already cleared the session. Anything else
          // (a busy server, no network) is retried by the next request.
        });
    }, msUntilRefresh(session, Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);
}

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from './useSession';

/** Route guard: logged-out visitors go to login, then come back to where they were. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}

import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSession, useSessionKeepAlive } from './auth/useSession';
import { api } from './lib/api';

const NAV = [
  { to: '/listings', label: 'Buy' },
  { to: '/rentals', label: 'Rent' },
  { to: '/projects', label: 'New projects' },
  { to: '/saved', label: 'Saved' },
  { to: '/insights', label: 'Data insights' },
];

export function App() {
  const session = useSession();
  useSessionKeepAlive();

  // Clearing the session is enough: protected pages redirect to login through
  // RequireAuth, and public pages stay put. A second navigate() here would race it.
  function logOut() {
    void api().logout();
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/listings" className="wordmark">
            Ivy Homes
          </Link>
          <nav className="mainnav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className="mainnav-link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="account">
            {session ? (
              <>
                <span className="account-email" title="Logged in">
                  {session.email}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={logOut}>
                  Log out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          A candidate build for the Ivy Homes software engineering internship, using the
          assignment API for Hyderabad.
        </div>
      </footer>
    </div>
  );
}

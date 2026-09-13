import { Link, NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/listings', label: 'Buy' },
  { to: '/rentals', label: 'Rent' },
  { to: '/projects', label: 'New projects' },
  { to: '/saved', label: 'Saved' },
  { to: '/insights', label: 'Data insights' },
];

export function App() {
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
            <Link to="/login" className="btn btn-secondary btn-sm">
              Log in
            </Link>
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

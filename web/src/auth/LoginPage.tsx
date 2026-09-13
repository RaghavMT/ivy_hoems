import { Link } from 'react-router-dom';

export function LoginPage() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Link to="/listings" className="wordmark">
          Ivy Homes
        </Link>
        <h1 className="auth-title">Log in</h1>
        <p className="auth-lede">Sign-in is coming in the next update.</p>
      </div>
    </div>
  );
}

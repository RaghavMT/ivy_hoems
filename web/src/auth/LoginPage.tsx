import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ApiError, UNREACHABLE_MESSAGE } from '../lib/client';
import { safeNextPath } from '../lib/redirect';
import { useSession } from './useSession';

const SLOW_AFTER_MS = 4000;

// Only app-written text is shown: ApiError messages are fixed per status, and any
// other error gets a generic line rather than whatever it carries.
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'The email or password is incorrect.';
    if (error.status === 0) return UNREACHABLE_MESSAGE;
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

export function LoginPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitting) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [submitting]);

  // Already logged in, or the login just succeeded: go where the user was heading.
  if (session) return <Navigate to={next} replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api().login(email.trim(), password);
    } catch (err) {
      setError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-intro">
        <Link to="/listings" className="wordmark wordmark-inverse">
          Ivy Homes
        </Link>
        <p className="auth-pitch">
          Browse Hyderabad homes for sale and rent, with prices and areas shown in consistent
          units even where the source data isn't.
        </p>
      </div>

      <div className="auth-card">
        <h1 className="auth-title">Log in</h1>
        <p className="auth-lede">Use one of the demo accounts from your assignment email.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="demo1@ivy.homes"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>

          <p className="form-status" aria-live="polite">
            {slow ? 'The server is taking longer than usual. Still trying.' : ''}
          </p>
        </form>
      </div>
    </div>
  );
}

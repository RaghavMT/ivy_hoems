import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { StatePanel } from './StatePanel';

export function RouteError() {
  const error = useRouteError();
  // An error's own text can quote a response body (a JSON parse error does), and API
  // text is untrusted, so the page shows only a status or a fixed line. Details go to
  // the console for debugging.
  console.error(error);
  const message = isRouteErrorResponse(error)
    ? `Error ${error.status}. Try again, or go back to the listings.`
    : 'Try reloading the page. If it keeps happening, go back to the listings.';

  return (
    <main className="main">
      <StatePanel
        tone="error"
        title="Something stopped this page from loading"
        action={
          <Link to="/listings" className="btn btn-primary">
            Go to homes for sale
          </Link>
        }
      >
        {message}
      </StatePanel>
    </main>
  );
}

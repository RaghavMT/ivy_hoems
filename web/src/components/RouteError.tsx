import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { StatePanel } from './StatePanel';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

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

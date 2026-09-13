import { Link } from 'react-router-dom';
import { StatePanel } from './StatePanel';

export function NotFound() {
  return (
    <StatePanel
      tone="empty"
      title="This page doesn't exist"
      action={
        <Link to="/listings" className="btn btn-primary">
          Browse homes for sale
        </Link>
      }
    >
      The address may be mistyped, or the link may be out of date.
    </StatePanel>
  );
}

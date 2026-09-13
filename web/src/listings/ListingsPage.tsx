import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';

export function ListingsPage() {
  return (
    <>
      <PageHeader title="Homes for sale">Apartments, houses, villas and plots listed across Hyderabad.</PageHeader>
      <StatePanel tone="empty" title="Coming in the next update">
        This section is part of the build in progress.
      </StatePanel>
    </>
  );
}

import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';

export function RentalsPage() {
  return (
    <>
      <PageHeader title="Homes for rent">Monthly rents in rupees, with deposit and carpet area in square feet.</PageHeader>
      <StatePanel tone="empty" title="Coming in the next update">
        This section is part of the build in progress.
      </StatePanel>
    </>
  );
}

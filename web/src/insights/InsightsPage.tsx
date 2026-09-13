import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';

export function InsightsPage() {
  return (
    <>
      <PageHeader title="Data insights">What the listing data shows, and where it cannot be taken at face value.</PageHeader>
      <StatePanel tone="empty" title="Coming in the next update">
        This section is part of the build in progress.
      </StatePanel>
    </>
  );
}

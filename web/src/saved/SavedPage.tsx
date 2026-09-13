import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';

export function SavedPage() {
  return (
    <>
      <PageHeader title="Saved homes">Listings you have saved, kept for your account.</PageHeader>
      <StatePanel tone="empty" title="Coming in the next update">
        This section is part of the build in progress.
      </StatePanel>
    </>
  );
}

import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';

export function ProjectsPage() {
  return (
    <>
      <PageHeader title="New projects">Developer projects with price ranges and unit sizes.</PageHeader>
      <StatePanel tone="empty" title="Coming in the next update">
        This section is part of the build in progress.
      </StatePanel>
    </>
  );
}

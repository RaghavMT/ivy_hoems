import type { ReactNode } from 'react';

type Props = { title: string; children?: ReactNode };

export function PageHeader({ title, children }: Props) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </header>
  );
}

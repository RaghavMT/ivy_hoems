import type { ReactNode } from 'react';

type Props = {
  tone: 'empty' | 'error' | 'loading';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

// One component for every "nothing to show yet" moment, so loading, empty and
// error states look deliberate on every page.
export function StatePanel({ tone, title, children, action }: Props) {
  return (
    <section
      className={`state-panel state-panel-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {tone === 'loading' ? <span className="spinner" aria-hidden="true" /> : null}
      <h2 className="state-panel-title">{title}</h2>
      {children ? <p className="state-panel-body">{children}</p> : null}
      {action ? <div className="state-panel-action">{action}</div> : null}
    </section>
  );
}

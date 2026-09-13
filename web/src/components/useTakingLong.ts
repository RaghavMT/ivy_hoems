import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `ms`, so slow loads can say so. */
export function useTakingLong(active: boolean, ms = 5000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);
  return slow;
}

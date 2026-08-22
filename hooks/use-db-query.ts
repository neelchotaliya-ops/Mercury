import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { getDb } from '@/db/client';
import { Db } from '@/db/types';
import { getDataVersion, subscribeDataVersion } from '@/db/version';

/**
 * The shared shape every screen-level query hook in this app is built on.
 *
 * Re-runs `run` whenever `db/version.ts`'s counter changes (any write
 * anywhere) or `key` changes (the caller's own params — a filter, a month, a
 * search term). The previous `data` is kept during a refetch rather than
 * cleared, so a filter change doesn't flash an empty state while the new
 * query is in flight — the same "hold the previous render" rule the chart
 * work earlier in this project already established.
 *
 * `key` is a plain string the caller builds (e.g. `JSON.stringify(filter)`)
 * rather than this hook trying to diff an arbitrary params object itself.
 */
export function useDbQuery<T>(key: string, run: (db: Db) => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const version = useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const db = await getDb();
        const result = await runRef.current(db);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  return { data, loading, error };
}

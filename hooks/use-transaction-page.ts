import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { Transaction } from '@/types/finance';
import { getDb } from '@/db/client';
import { pageTransactions, TransactionFilter, TxCursor } from '@/db/transactions';
import { getDataVersion, subscribeDataVersion } from '@/db/version';

/**
 * Keyset-paginated transaction list for Activity.
 *
 * Resets to a fresh first page whenever the filter or the search needle
 * changes, or whenever any write anywhere bumps `db/version.ts` — a new
 * transaction, an edit, a delete, all invalidate the list the same way. Pages
 * accumulate in `rows` as `loadMore` is called (wired to `FlatList`'s
 * `onEndReached`), never loading the whole ledger at once the way the old
 * `state.transactions` scan did.
 */
export function useTransactionPage(filter: TransactionFilter, pageSize = 60) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<TxCursor | null>(null);
  const exhaustedRef = useRef(false);
  const inFlightRef = useRef(false);
  const filterKey = JSON.stringify(filter);

  const version = useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion);

  useEffect(() => {
    let cancelled = false;
    cursorRef.current = null;
    exhaustedRef.current = false;
    setLoading(true);
    (async () => {
      const db = await getDb();
      const page = await pageTransactions(db, filter, null, pageSize);
      if (cancelled) return;
      setRows(page.rows);
      cursorRef.current = page.nextCursor;
      exhaustedRef.current = page.nextCursor === null;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, pageSize, version]);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || exhaustedRef.current) return;
    inFlightRef.current = true;
    setLoadingMore(true);
    try {
      const db = await getDb();
      const page = await pageTransactions(db, filter, cursorRef.current, pageSize);
      setRows(prev => [...prev, ...page.rows]);
      cursorRef.current = page.nextCursor;
      exhaustedRef.current = page.nextCursor === null;
    } finally {
      inFlightRef.current = false;
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, pageSize]);

  return { rows, loading, loadingMore, loadMore, exhausted: exhaustedRef.current };
}

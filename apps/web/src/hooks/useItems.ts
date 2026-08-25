import { useState, useEffect, useCallback, useRef } from 'react';
import type { ItemSummary, ItemStatus } from '@ai-knowledge-inbox/contracts';
import { fetchItems } from '../lib/api.js';

export function useItems(statusFilter?: ItemStatus) {
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchItems({ limit: 100, status: statusFilter });
      setItems(res.items);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const addOptimisticItem = useCallback((item: ItemSummary) => {
    setItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Polling loop for items in queued/processing/retry_wait state
  useEffect(() => {
    const hasPending = items.some(
      (i) => i.status === 'queued' || i.status === 'processing' || i.status === 'retry_wait'
    );

    if (hasPending) {
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await fetchItems({ limit: 100, status: statusFilter });
          setItems(res.items);
        } catch {
          // ignore poll errors
        }
      }, 1500);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [items, statusFilter]);

  return {
    items,
    loading,
    error,
    refetch: loadItems,
    addOptimisticItem,
  };
}

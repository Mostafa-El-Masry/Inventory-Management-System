"use client";

import { useEffect, useMemo, useState } from "react";

export type MasterColumnDefinition<K extends string> = {
  key: K;
  label: string;
};

type UseMasterColumnsOptions<K extends string> = {
  userId: string;
  storageKey: string;
  columns: readonly MasterColumnDefinition<K>[];
  defaultOrder: readonly K[];
  defaultVisibility: Record<K, boolean>;
};

function cloneVisibility<K extends string>(visibility: Record<K, boolean>) {
  return { ...visibility };
}

function normalizeColumnOrder<K extends string>(
  raw: unknown,
  defaultOrder: readonly K[],
  validKeys: Set<K>,
) {
  if (!Array.isArray(raw)) {
    return [...defaultOrder];
  }

  const ordered: K[] = [];
  for (const value of raw) {
    if (!validKeys.has(value as K)) {
      continue;
    }
    if (ordered.includes(value as K)) {
      continue;
    }
    ordered.push(value as K);
  }

  for (const value of defaultOrder) {
    if (!ordered.includes(value)) {
      ordered.push(value);
    }
  }

  return ordered;
}

function normalizeColumnVisibility<K extends string>(
  raw: unknown,
  defaultVisibility: Record<K, boolean>,
  defaultOrder: readonly K[],
) {
  const next = cloneVisibility(defaultVisibility);
  if (!raw || typeof raw !== "object") {
    return next;
  }

  for (const key of defaultOrder) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "boolean") {
      next[key] = value;
    }
  }

  const visibleCount = defaultOrder.reduce(
    (count, key) => count + (next[key] ? 1 : 0),
    0,
  );

  if (visibleCount === 0) {
    return cloneVisibility(defaultVisibility);
  }

  return next;
}

export function buildDefaultColumnVisibility<K extends string>(
  defaultOrder: readonly K[],
  initiallyVisible: readonly K[] = defaultOrder,
) {
  const visibleKeys = new Set(initiallyVisible);

  return Object.fromEntries(
    defaultOrder.map((key) => [key, visibleKeys.has(key)]),
  ) as Record<K, boolean>;
}

export function useMasterColumns<K extends string>({
  userId,
  storageKey,
  columns,
  defaultOrder,
  defaultVisibility,
}: UseMasterColumnsOptions<K>) {
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [columnOrder, setColumnOrder] = useState<K[]>(() => [...defaultOrder]);
  const [columnVisibility, setColumnVisibility] = useState<Record<K, boolean>>(() =>
    cloneVisibility(defaultVisibility),
  );

  useEffect(() => {
    if (!userId) {
      setColumnOrder([...defaultOrder]);
      setColumnVisibility(cloneVisibility(defaultVisibility));
      setPrefsLoaded(false);
      return;
    }

    setPrefsLoaded(false);

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setColumnOrder([...defaultOrder]);
        setColumnVisibility(cloneVisibility(defaultVisibility));
        setPrefsLoaded(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        order?: unknown;
        visibility?: unknown;
      };
      const validKeys = new Set(defaultOrder);

      setColumnOrder(normalizeColumnOrder(parsed.order, defaultOrder, validKeys));
      setColumnVisibility(
        normalizeColumnVisibility(parsed.visibility, defaultVisibility, defaultOrder),
      );
    } catch {
      setColumnOrder([...defaultOrder]);
      setColumnVisibility(cloneVisibility(defaultVisibility));
    } finally {
      setPrefsLoaded(true);
    }
  }, [defaultOrder, defaultVisibility, storageKey, userId]);

  useEffect(() => {
    if (!userId || !prefsLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          order: columnOrder,
          visibility: columnVisibility,
        }),
      );
    } catch {
      return;
    }
  }, [columnOrder, columnVisibility, prefsLoaded, storageKey, userId]);

  const columnDefinitionByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );

  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((key) => columnDefinitionByKey.get(key))
        .filter((column): column is MasterColumnDefinition<K> => column !== undefined),
    [columnDefinitionByKey, columnOrder],
  );

  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => columnVisibility[column.key]),
    [columnVisibility, orderedColumns],
  );

  function toggleColumnVisibility(columnKey: K) {
    setColumnVisibility((current) => {
      if (current[columnKey]) {
        const visibleCount = defaultOrder.reduce(
          (count, key) => count + (current[key] ? 1 : 0),
          0,
        );
        if (visibleCount <= 1) {
          return current;
        }
      }

      return {
        ...current,
        [columnKey]: !current[columnKey],
      };
    });
  }

  function moveColumn(columnKey: K, direction: -1 | 1) {
    setColumnOrder((current) => {
      const index = current.indexOf(columnKey);
      if (index < 0) {
        return current;
      }

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  }

  function resetColumnPreferences() {
    setColumnOrder([...defaultOrder]);
    setColumnVisibility(cloneVisibility(defaultVisibility));
  }

  return {
    orderedColumns,
    visibleColumns,
    columnVisibility,
    toggleColumnVisibility,
    moveColumn,
    resetColumnPreferences,
  };
}

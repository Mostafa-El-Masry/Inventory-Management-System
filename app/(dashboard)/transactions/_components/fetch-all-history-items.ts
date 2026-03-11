"use client";

import { fetchJson } from "@/lib/utils/fetch-json";

type HistoryItemsResponse<T> = {
  items?: T[];
  error?: string;
};

export async function fetchAllHistoryItems<T>(
  path: string,
  {
    signal,
    fallbackError,
    batchSize = 200,
  }: {
    signal?: AbortSignal;
    fallbackError: string;
    batchSize?: number;
  },
) {
  const items: T[] = [];
  let page = 1;

  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const result = await fetchJson<HistoryItemsResponse<T>>(
      `${path}${separator}limit=${batchSize}&page=${page}`,
      {
        cache: "no-store",
        signal,
        fallbackError,
      },
    );

    if (!result.ok) {
      return result;
    }

    const batch = result.data.items ?? [];
    items.push(...batch);

    if (batch.length < batchSize) {
      return {
        ok: true as const,
        data: items,
      };
    }

    page += 1;
  }
}

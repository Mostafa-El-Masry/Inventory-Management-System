export type FetchJsonResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
      error: null;
    }
  | {
      ok: false;
      status: number;
      data: null;
      error: string;
    };

type FetchJsonInit = RequestInit & {
  fallbackError?: string;
};

function extractErrorMessage(json: unknown, fallbackError: string) {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof (json as { error: unknown }).error === "string"
  ) {
    return (json as { error: string }).error;
  }

  return fallbackError;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: FetchJsonInit = {},
): Promise<FetchJsonResult<T>> {
  const fallbackError = init.fallbackError ?? "Request failed.";

  try {
    const response = await fetch(input, init);
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: extractErrorMessage(json, fallbackError),
      };
    }

    return {
      ok: true,
      status: response.status,
      data: (json ?? ({} as T)) as T,
      error: null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        data: null,
        error: "Request aborted.",
      };
    }

    return {
      ok: false,
      status: 0,
      data: null,
      error: fallbackError,
    };
  }
}

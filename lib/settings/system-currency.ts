export const SYSTEM_CURRENCY_CODES = ["KWD", "USD", "EGP"] as const;

export type SystemCurrencyCode = (typeof SYSTEM_CURRENCY_CODES)[number];

export const DEFAULT_SYSTEM_CURRENCY_CODE: SystemCurrencyCode = "KWD";
export const SYSTEM_CURRENCY_SETTING_KEY = "currency_code";

export type SystemCurrencyDisplayParts = {
  fullText: string;
  currency: string;
  amount: string;
};

export function getSystemCurrencyFractionDigits(
  currencyCode: SystemCurrencyCode,
) {
  return currencyCode === "KWD" ? 3 : 2;
}

export function getSystemCurrencyInputStep(
  currencyCode: SystemCurrencyCode,
) {
  return currencyCode === "KWD" ? "0.001" : "0.01";
}

export function roundSystemCurrencyValue(
  value: number,
  currencyCode: SystemCurrencyCode,
) {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Number(value.toFixed(getSystemCurrencyFractionDigits(currencyCode)));
}

export function normalizeSystemCurrencyValue(
  value: string | number | null | undefined,
  currencyCode: SystemCurrencyCode,
) {
  if (value == null) {
    return null;
  }

  const parsedValue =
    typeof value === "number"
      ? value
      : value.trim() === ""
        ? null
        : Number(value.trim());

  if (parsedValue == null) {
    return null;
  }

  if (!Number.isFinite(parsedValue)) {
    return Number.NaN;
  }

  return roundSystemCurrencyValue(parsedValue, currencyCode);
}

export function hasSystemCurrencyValuePrecision(
  value: string | number | null | undefined,
  currencyCode: SystemCurrencyCode,
) {
  const normalizedValue =
    typeof value === "number" ? String(value) : (value ?? "").trim();
  if (!normalizedValue) {
    return true;
  }

  const decimalSeparatorIndex = normalizedValue.indexOf(".");
  if (decimalSeparatorIndex < 0) {
    return true;
  }

  const fraction = normalizedValue.slice(decimalSeparatorIndex + 1);
  return fraction.length <= getSystemCurrencyFractionDigits(currencyCode);
}

export type SystemSettingsReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { value_text: string | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export function normalizeSystemCurrencyCode(
  value: string | null | undefined,
): SystemCurrencyCode {
  const normalized = (value ?? "").trim().toUpperCase();
  if (
    (SYSTEM_CURRENCY_CODES as readonly string[]).includes(normalized)
  ) {
    return normalized as SystemCurrencyCode;
  }

  return DEFAULT_SYSTEM_CURRENCY_CODE;
}

export function formatSystemCurrency(
  value: number | null | undefined,
  currencyCode: SystemCurrencyCode,
  fallback = "--",
) {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: getSystemCurrencyFractionDigits(currencyCode),
    maximumFractionDigits: getSystemCurrencyFractionDigits(currencyCode),
  }).format(value);
}

export function formatSystemCurrencyParts(
  value: number | null | undefined,
  currencyCode: SystemCurrencyCode,
  fallback = "--",
): SystemCurrencyDisplayParts {
  if (value == null || !Number.isFinite(value)) {
    return {
      fullText: fallback,
      currency: "",
      amount: fallback,
    };
  }

  const formatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: getSystemCurrencyFractionDigits(currencyCode),
    maximumFractionDigits: getSystemCurrencyFractionDigits(currencyCode),
  });
  const fullText = formatter.format(value);
  const parts = formatter.formatToParts(value);
  const currency = parts
    .filter((part) => part.type === "currency")
    .map((part) => part.value)
    .join("")
    .trim();
  const amount = parts
    .filter((part) => part.type !== "currency" && part.type !== "literal")
    .map((part) => part.value)
    .join("");

  return {
    fullText,
    currency,
    amount: amount || fullText,
  };
}

export async function loadSystemCurrencyCode(supabase: SystemSettingsReader) {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value_text")
    .eq("key", SYSTEM_CURRENCY_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.warn(`[SETTINGS] Failed to load currency code: ${error.message}`);
    return DEFAULT_SYSTEM_CURRENCY_CODE;
  }

  return normalizeSystemCurrencyCode(data?.value_text);
}

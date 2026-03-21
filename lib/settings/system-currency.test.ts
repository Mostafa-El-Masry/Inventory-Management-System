import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SYSTEM_CURRENCY_CODE,
  formatSystemCurrency,
  formatSystemCurrencyParts,
  getSystemCurrencyFractionDigits,
  getSystemCurrencyInputStep,
  hasSystemCurrencyValuePrecision,
  loadSystemCurrencyCode,
  normalizeSystemCurrencyCode,
  roundSystemCurrencyValue,
} from "@/lib/settings/system-currency";

describe("system currency helpers", () => {
  it("falls back to KWD for missing or invalid values", () => {
    expect(normalizeSystemCurrencyCode(null)).toBe(DEFAULT_SYSTEM_CURRENCY_CODE);
    expect(normalizeSystemCurrencyCode("aed")).toBe(DEFAULT_SYSTEM_CURRENCY_CODE);
  });

  it("normalizes supported currency codes", () => {
    expect(normalizeSystemCurrencyCode("usd")).toBe("USD");
    expect(normalizeSystemCurrencyCode(" EGP ")).toBe("EGP");
  });

  it("formats supported currencies", () => {
    expect(formatSystemCurrency(12.5, "KWD")).toContain("KWD");
    expect(formatSystemCurrency(12.5, "KWD")).toMatch(/12\.500/);
    expect(formatSystemCurrency(12.5, "USD")).toMatch(/12\.50/);
    expect(formatSystemCurrency(12.5, "EGP")).toMatch(/12\.50/);
  });

  it("returns the fallback text for invalid numbers", () => {
    expect(formatSystemCurrency(null, "KWD")).toBe("--");
    expect(formatSystemCurrency(Number.NaN, "KWD")).toBe("--");
  });

  it("splits currency and amount for responsive display", () => {
    expect(formatSystemCurrencyParts(12.5, "KWD")).toEqual({
      fullText: "KWD\u00A012.500",
      currency: "KWD",
      amount: "12.500",
    });
    expect(formatSystemCurrencyParts(12.5, "USD")).toEqual({
      fullText: "$12.50",
      currency: "$",
      amount: "12.50",
    });
  });

  it("exposes currency-aware precision helpers", () => {
    expect(getSystemCurrencyFractionDigits("KWD")).toBe(3);
    expect(getSystemCurrencyFractionDigits("USD")).toBe(2);
    expect(getSystemCurrencyInputStep("KWD")).toBe("0.001");
    expect(getSystemCurrencyInputStep("EGP")).toBe("0.01");
    expect(roundSystemCurrencyValue(12.3456, "KWD")).toBe(12.346);
    expect(roundSystemCurrencyValue(12.3456, "USD")).toBe(12.35);
    expect(hasSystemCurrencyValuePrecision("1.234", "KWD")).toBe(true);
    expect(hasSystemCurrencyValuePrecision("1.234", "USD")).toBe(false);
  });

  it("loads the stored currency code from system settings", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { value_text: "USD" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(loadSystemCurrencyCode({ from })).resolves.toBe("USD");
  });

  it("falls back when the system settings query fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(loadSystemCurrencyCode({ from })).resolves.toBe("KWD");

    warn.mockRestore();
  });
});

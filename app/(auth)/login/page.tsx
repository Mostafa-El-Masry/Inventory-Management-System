"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { fetchJson } from "@/lib/utils/fetch-json";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    try {
      const result = await fetchJson<{ error?: string; success?: boolean }>(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          fallbackError: "Failed to login.",
        },
      );

      if (!result.ok) {
        if (result.status === 429) {
          setError("Too many login attempts. Please try again in 15 minutes.");
          return;
        }
        setError(result.error);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetLoading(true);
    setResetError(null);
    setResetMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("reset_email") ?? "").trim();

    try {
      const result = await fetchJson<{
        error?: string;
        success?: boolean;
        warning?: string;
      }>("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
        fallbackError: "Failed to send recovery email.",
      });

      if (!result.ok) {
        if (result.status === 429) {
          setResetError("Too many reset attempts. Please try again later.");
          return;
        }
        setResetError(result.error);
        return;
      }

      // Success - always show user-friendly message (genuine or not to prevent email enumeration)
      setResetMessage(
        result.data.warning ??
          "If an account with this email exists, you'll receive a password reset link shortly. Check your inbox and spam folder.",
      );
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div>
      <p className="ims-kicker">ICE</p>
      <h1 className="ims-title mt-2 text-[2rem]">Sign in to Inventory Management</h1>
      <p className="ims-subtitle">Use your company credentials to access operations.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="ims-field-label">
            Work email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="h-11"
          />
        </div>

        <div>
          <label htmlFor="password" className="ims-field-label">
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="current-password"
            className="h-11"
          />
        </div>

        {error ? <p className="ims-alert-danger">{error}</p> : null}

        <Button type="submit" disabled={loading} className="h-11 w-full rounded-2xl">
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
        <button
          type="button"
          onClick={() => setResetOpen((value) => !value)}
          className="text-sm font-semibold text-[var(--text-strong)] underline-offset-4 hover:underline"
        >
          Forgot password?
        </button>

        {resetOpen ? (
          <form onSubmit={onResetPassword} className="mt-3 space-y-3">
            <div>
              <label htmlFor="reset_email" className="ims-field-label">
                Account email
              </label>
              <Input
                id="reset_email"
                name="reset_email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="h-11"
              />
            </div>

            {resetError ? <p className="ims-alert-danger">{resetError}</p> : null}
            {resetMessage ? <p className="ims-alert-success">{resetMessage}</p> : null}

            <Button
              type="submit"
              variant="outline"
              disabled={resetLoading}
              className="h-11 rounded-2xl"
            >
              {resetLoading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}


"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createClient } from "@/lib/supabase/client";

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

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(json.error ?? "Failed to login.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetLoading(true);
    setResetError(null);
    setResetMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("reset_email") ?? "").trim();
    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/set-password`;

    const { error: resetRequestError } = await createClient().auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );

    if (resetRequestError) {
      setResetError(resetRequestError.message);
      setResetLoading(false);
      return;
    }

    setResetMessage("Password reset email sent. Check your inbox.");
    setResetLoading(false);
  }

  return (
    <div>
      <p className="ims-kicker">IMS</p>
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

      <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4">
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

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

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
    setResetLink(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("reset_email") ?? "").trim();

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const json = (await response.json()) as {
      error?: string;
      warning?: string;
      dev_reset_link?: string;
    };

    if (!response.ok) {
      setResetError(json.error ?? "Failed to send recovery email.");
      setResetLoading(false);
      return;
    }

    setResetMessage(json.warning ?? "Password reset email sent. Check your inbox.");
    setResetLink(json.dev_reset_link ?? null);
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
            {resetLink ? (
              <p className="ims-alert-success">
                <a
                  href={resetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline break-all"
                >
                  Open password reset link
                </a>
              </p>
            ) : null}

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

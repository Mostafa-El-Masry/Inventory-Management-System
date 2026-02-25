"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const sessionResult = await createClient().auth.getSession();
        if (!mounted) return;

        if (sessionResult.error || !sessionResult.data.session) {
          router.replace("/login?error=invalid_or_expired_link");
          return;
        }

        setReady(true);
      } catch {
        if (mounted) {
          router.replace("/login?error=invalid_or_expired_link");
        }
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-700">IMS</p>
        <h1 className="text-2xl font-semibold text-slate-900">Setting up account</h1>
        <p className="text-sm text-slate-600">Validating your invite link...</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.24em] text-cyan-700">IMS</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Set your account password
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Create a secure password to complete your account setup.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-700">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-cyan-500 focus:ring-2"
          />
        </div>

        <div>
          <label htmlFor="confirm_password" className="mb-1 block text-sm text-slate-700">
            Confirm password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-cyan-500 focus:ring-2"
          />
        </div>

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={loading} className="h-11 w-full">
          {loading ? "Saving..." : "Save password"}
        </Button>
      </form>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
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
        <p className="ims-kicker">IMS</p>
        <h1 className="ims-title text-[1.75rem]">Setting up account</h1>
        <p className="ims-subtitle">Validating your invite link...</p>
      </div>
    );
  }

  return (
    <div>
      <p className="ims-kicker">IMS</p>
      <h1 className="ims-title mt-2 text-[1.95rem]">Set your account password</h1>
      <p className="ims-subtitle">Create a secure password to complete your account setup.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="ims-field-label">
            New password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="h-11"
          />
        </div>

        <div>
          <label htmlFor="confirm_password" className="ims-field-label">
            Confirm password
          </label>
          <PasswordInput
            id="confirm_password"
            name="confirm_password"
            autoComplete="new-password"
            required
            minLength={8}
            className="h-11"
          />
        </div>

        {error ? <p className="ims-alert-danger">{error}</p> : null}

        <Button type="submit" disabled={loading} className="h-11 w-full rounded-2xl">
          {loading ? "Saving..." : "Save password"}
        </Button>
      </form>
    </div>
  );
}

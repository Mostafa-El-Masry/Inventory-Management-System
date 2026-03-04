"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { createClient } from "@/lib/supabase/client";

const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`At least ${PASSWORD_REQUIREMENTS.minLength} characters required`);
  }
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Must contain at least one uppercase letter");
  }
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Must contain at least one lowercase letter");
  }
  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    errors.push("Must contain at least one number");
  }
  if (
    PASSWORD_REQUIREMENTS.requireSymbol &&
    !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  ) {
    errors.push("Must contain at least one special character (!@#$% etc)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);

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

  function handlePasswordChange(password: string) {
    setPasswordStrength(validatePassword(password));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    const validation = validatePassword(password);
    if (!validation.valid) {
      setError(validation.errors.join(". ") + ".");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password,
        confirm_password: confirmPassword,
      }),
    });

    const json = (await response.json()) as { error?: string; success?: boolean };

    if (!response.ok) {
      setError(json.error ?? "Failed to update password.");
      setLoading(false);
      return;
    }

    router.push("/login?success=password_reset");
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="space-y-3">
        <p className="ims-kicker">ICE</p>
        <h1 className="ims-title text-[1.75rem]">Setting up account</h1>
        <p className="ims-subtitle">Validating your invite link...</p>
      </div>
    );
  }

  return (
    <div>
      <p className="ims-kicker">ICE</p>
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
            minLength={12}
            onChange={(e) => handlePasswordChange(e.currentTarget.value)}
            className="h-11"
          />
          {passwordStrength && !passwordStrength.valid ? (
            <div className="mt-2 space-y-1">
              {passwordStrength.errors.map((strengthError, idx) => (
                <p key={idx} className="text-sm text-red-600">
                  - {strengthError}
                </p>
              ))}
            </div>
          ) : null}
          {passwordStrength && passwordStrength.valid ? (
            <p className="mt-2 text-sm text-green-600">Password meets requirements.</p>
          ) : null}
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
            minLength={12}
            className="h-11"
          />
        </div>

        {error ? <p className="ims-alert-danger">{error}</p> : null}

        <Button
          type="submit"
          disabled={loading || !passwordStrength?.valid}
          className="h-11 w-full rounded-2xl"
        >
          {loading ? "Saving..." : "Save password"}
        </Button>
      </form>

      <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
        <p className="text-sm font-semibold text-yellow-900">Password Requirements:</p>
        <ul className="mt-2 space-y-1 text-sm text-yellow-800">
          <li>At least 12 characters</li>
          <li>Contains uppercase letter (A-Z)</li>
          <li>Contains lowercase letter (a-z)</li>
          <li>Contains number (0-9)</li>
          <li>Contains special character (!@#$% etc)</li>
        </ul>
      </div>
    </div>
  );
}

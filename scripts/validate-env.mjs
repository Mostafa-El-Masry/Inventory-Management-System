import process from "node:process";

import nextEnv from "@next/env";
import { z } from "zod";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const EXAMPLES = {
  NEXT_PUBLIC_SUPABASE_URL: "https://your-project-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key",
  APP_ORIGIN_ALLOWLIST:
    "https://your-project.vercel.app,https://inventory.example.com",
  AUTH_DEV_RESET_FALLBACK_ENABLED: "false",
};

const originAllowlistSchema = z
  .string()
  .min(1, "APP_ORIGIN_ALLOWLIST is required.")
  .transform((value, ctx) => {
    const entries = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (entries.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "APP_ORIGIN_ALLOWLIST must include at least one origin.",
      });
      return z.NEVER;
    }

    const normalizedOrigins = [];
    for (const entry of entries) {
      if (entry.includes("*")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "APP_ORIGIN_ALLOWLIST does not support wildcards. Use exact origins.",
        });
        return z.NEVER;
      }

      let url;
      try {
        url = new URL(entry);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid origin in APP_ORIGIN_ALLOWLIST: ${entry}`,
        });
        return z.NEVER;
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `APP_ORIGIN_ALLOWLIST only supports http/https origins: ${entry}`,
        });
        return z.NEVER;
      }

      if (url.pathname !== "/" || url.search || url.hash) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "APP_ORIGIN_ALLOWLIST entries must be exact origins without paths, query, or hash.",
        });
        return z.NEVER;
      }

      normalizedOrigins.push(url.origin);
    }

    return Array.from(new Set(normalizedOrigins));
  });

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_URL is required.")
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL."),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required."),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required."),
  APP_ORIGIN_ALLOWLIST: originAllowlistSchema,
  AUTH_DEV_RESET_FALLBACK_ENABLED: z
    .enum(["true", "false"], {
      errorMap: () => ({
        message:
          "AUTH_DEV_RESET_FALLBACK_ENABLED must be either 'true' or 'false'.",
      }),
    })
    .default("false"),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  APP_ORIGIN_ALLOWLIST: process.env.APP_ORIGIN_ALLOWLIST ?? "",
  AUTH_DEV_RESET_FALLBACK_ENABLED: process.env.AUTH_DEV_RESET_FALLBACK_ENABLED,
});

if (!parsed.success) {
  const seen = new Set();
  const lines = [];

  for (const issue of parsed.error.issues) {
    const key = issue.path[0] ? String(issue.path[0]) : "ENVIRONMENT";
    if (seen.has(key)) continue;
    seen.add(key);

    const example = EXAMPLES[key];
    const suffix = example ? ` Example: ${key}=${example}` : "";
    lines.push(`- ${key}: ${issue.message}${suffix}`);
  }

  console.error("[env] Invalid environment variables. Build aborted.");
  console.error(lines.join("\n"));
  process.exit(1);
}

console.log("[env] Environment validation passed.");

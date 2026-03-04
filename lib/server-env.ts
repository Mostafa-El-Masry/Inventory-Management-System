import { z } from "zod";

function resolveAppOriginAllowlistInput() {
  const configured = process.env.APP_ORIGIN_ALLOWLIST?.trim();
  if (configured) {
    return configured;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const normalized = vercelUrl.replace(/^https?:\/\//i, "").trim();
    if (normalized.length > 0) {
      return `https://${normalized}`;
    }
  }

  return undefined;
}

const originAllowlistSchema = z.string().min(1).transform((value, ctx) => {
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

  const normalizedOrigins: string[] = [];
  for (const entry of entries) {
    let url: URL;
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

    normalizedOrigins.push(url.origin);
  }

  return Array.from(new Set(normalizedOrigins));
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_ORIGIN_ALLOWLIST: originAllowlistSchema,
  AUTH_DEV_RESET_FALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const parsed = serverEnvSchema.safeParse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  APP_ORIGIN_ALLOWLIST: resolveAppOriginAllowlistInput(),
  AUTH_DEV_RESET_FALLBACK_ENABLED: process.env.AUTH_DEV_RESET_FALLBACK_ENABLED,
});

if (!parsed.success) {
  throw new Error(
    `Invalid server environment variables:\n${parsed.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")}`,
  );
}

export const serverEnv = parsed.data;

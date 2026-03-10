const env = process.env as Record<string, string | undefined>;

env.NODE_ENV ??= "test";
env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
env.APP_ORIGIN_ALLOWLIST ??= "https://app.example.com";

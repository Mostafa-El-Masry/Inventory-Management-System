import { NextResponse } from "next/server";
import { ZodSchema } from "zod";

export type JsonRecord = Record<string, unknown>;

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      details: details ?? null,
    },
    { status },
  );
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return {
      error: fail("Invalid JSON body.", 400),
    } as const;
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      error: fail("Validation failed.", 422, parsed.error.flatten()),
    } as const;
  }

  return {
    data: parsed.data,
  } as const;
}

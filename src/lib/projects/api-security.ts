import { NextResponse } from "next/server";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse };

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const unknownClient = "unknown";

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0];

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwardedFor?.trim() ??
    unknownClient
  );
}

export function rateLimitKey(
  request: Request,
  scope: string,
  userId?: string | null,
) {
  return `${scope}:${userId ? `user:${userId}` : `ip:${getClientIp(request)}`}`;
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const };
  }

  if (bucket.count >= limit) {
    return {
      ok: false as const,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { ok: true as const };
}

export function rateLimitResponse(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function readJsonObject(
  request: Request,
): Promise<JsonObjectResult> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { form: "Invalid JSON body." } },
        { status: 400 },
      ),
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { form: "Expected a JSON object." } },
        { status: 400 },
      ),
    };
  }

  return { ok: true, value: value as Record<string, unknown> };
}

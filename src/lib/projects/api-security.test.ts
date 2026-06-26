import { expect, test } from "bun:test";
import { checkRateLimit, rateLimitKey, readJsonObject } from "./api-security";

test("readJsonObject returns a clean 400 response for malformed JSON", async () => {
  const result = await readJsonObject(
    new Request("https://example.test/api/projects", {
      body: "{",
      method: "POST",
    }),
  );

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      errors: { form: "Invalid JSON body." },
    });
  }
});

test("readJsonObject rejects non-object JSON bodies", async () => {
  const result = await readJsonObject(
    new Request("https://example.test/api/projects", {
      body: JSON.stringify(["not", "an", "object"]),
      method: "POST",
    }),
  );

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      errors: { form: "Expected a JSON object." },
    });
  }
});

test("rateLimitKey prefers Clerk user IDs over client IP headers", () => {
  const request = new Request("https://example.test/api/projects", {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.2" },
  });

  expect(rateLimitKey(request, "project:create", "user_123")).toBe(
    "project:create:user:user_123",
  );
});

test("checkRateLimit blocks requests over the configured limit", () => {
  const key = `test:${crypto.randomUUID()}`;

  expect(checkRateLimit({ key, limit: 2, windowMs: 60_000 })).toEqual({
    ok: true,
  });
  expect(checkRateLimit({ key, limit: 2, windowMs: 60_000 })).toEqual({
    ok: true,
  });

  const result = checkRateLimit({ key, limit: 2, windowMs: 60_000 });

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.retryAfter).toBeGreaterThan(0);
  }
});

// Rate limiting middleware for expensive endpoints
// Per-user and per-IP limits to prevent abuse of AI/AWS operations
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix: "user" | "ip" | "both";
}

// In-memory rate limiting (production should use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now >= value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

export function createRateLimiter(config: RateLimitConfig) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const request = getRequest();
    if (!request) {
      throw new Error("Rate limiter: No request available");
    }

    const keys: string[] = [];
    const now = Date.now();

    // Extract user ID from context (set by requireSupabaseAuth)
    if (config.keyPrefix === "user" || config.keyPrefix === "both") {
      const userId = (context as { userId?: string }).userId;
      if (userId) {
        keys.push(`user:${userId}`);
      }
    }

    // Extract IP address
    if (config.keyPrefix === "ip" || config.keyPrefix === "both") {
      const ip =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-real-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        "unknown";
      keys.push(`ip:${ip}`);
    }

    // Check rate limits for all keys
    for (const key of keys) {
      const entry = rateLimitStore.get(key);

      if (entry) {
        if (now < entry.resetAt) {
          if (entry.count >= config.maxRequests) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            return new Response(
              JSON.stringify({
                error: "Rate limit exceeded",
                retryAfter,
                message: `Too many requests. Please try again in ${retryAfter} seconds.`,
              }),
              {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": String(retryAfter),
                },
              },
            );
          }
          entry.count++;
        } else {
          // Window expired, reset
          rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
        }
      } else {
        // First request in window
        rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
      }
    }

    return next({ context });
  });
}

// Preset rate limiters for different endpoint types
export const rateLimitAI = createRateLimiter({
  maxRequests: 10, // 10 AI calls per minute per user
  windowMs: 60 * 1000,
  keyPrefix: "user",
});

export const rateLimitAWS = createRateLimiter({
  maxRequests: 5, // 5 AWS operations per minute per user
  windowMs: 60 * 1000,
  keyPrefix: "user",
});

export const rateLimitAuth = createRateLimiter({
  maxRequests: 20, // 20 requests per minute per IP (prevent credential stuffing)
  windowMs: 60 * 1000,
  keyPrefix: "ip",
});

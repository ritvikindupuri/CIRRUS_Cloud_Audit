// CORS middleware with fail-closed design
// If ALLOWED_ORIGINS is unset in production, all CORS requests are rejected
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const corsMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request) {
    return next({});
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // No origin header = same-origin request, allow
    return next({});
  }

  const nodeEnv = process.env.NODE_ENV || "development";
  const allowedOriginsRaw = process.env.ALLOWED_ORIGINS;

  let allowedOrigins: string[] = [];

  if (nodeEnv === "production") {
    if (!allowedOriginsRaw || allowedOriginsRaw.trim() === "") {
      // FAIL CLOSED: Production with no ALLOWED_ORIGINS = reject all CORS
      console.error(`[CORS] REJECTED: ALLOWED_ORIGINS not set in production. Origin: ${origin}`);
      return new Response(
        JSON.stringify({
          error: "CORS configuration error",
          message: "Cross-origin requests are not allowed. Contact the administrator.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    allowedOrigins = allowedOriginsRaw.split(",").map((o) => o.trim());
  } else {
    // Development: allow localhost + configured origins
    allowedOrigins = allowedOriginsRaw ? allowedOriginsRaw.split(",").map((o) => o.trim()) : [];
    allowedOrigins.push("http://localhost:8080", "http://localhost:3000");
  }

  // Check if origin is allowed
  const isAllowed = allowedOrigins.some((allowed) => {
    if (allowed === "*") return true;
    if (allowed.startsWith("*.")) {
      // Wildcard subdomain: *.example.com
      const domain = allowed.slice(2);
      return origin.endsWith(`.${domain}`) || origin === `https://${domain}`;
    }
    return origin === allowed;
  });

  if (!isAllowed) {
    console.warn(`[CORS] REJECTED: Origin not in allowlist. Origin: ${origin}`);
    return new Response(
      JSON.stringify({
        error: "CORS policy violation",
        message: "This origin is not allowed to access this resource.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Origin allowed, proceed
  const response = await next({});

  // Add CORS headers to response
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  response.headers.set("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: response.headers,
    });
  }

  return response;
});

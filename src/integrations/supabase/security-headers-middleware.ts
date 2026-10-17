// Security headers middleware
// Implements CSP, HSTS, COOP, COEP, X-Frame-Options, etc.
import { createMiddleware } from "@tanstack/react-start";

export const securityHeadersMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const response = await next({});

    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";

    // Content Security Policy
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-* required for Vite/charts
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com https://api.resend.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ];
    response.headers.set("Content-Security-Policy", cspDirectives.join("; "));

    // HSTS: enforce HTTPS for 1 year
    if (isProduction) {
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      );
    }

    // Prevent MIME type sniffing
    response.headers.set("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    response.headers.set("X-Frame-Options", "DENY");

    // Referrer policy
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions Policy: deny all sensitive features
    response.headers.set(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
    );

    // Cross-Origin-Opener-Policy
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

    // Cross-Origin-Embedder-Policy (relaxed to allow external resources)
    response.headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");

    // Cross-Origin-Resource-Policy
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

    // Remove server identification
    response.headers.delete("Server");
    response.headers.delete("X-Powered-By");

    return response;
  },
);

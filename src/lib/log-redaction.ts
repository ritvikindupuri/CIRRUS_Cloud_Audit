// Log redaction utilities to prevent secret leakage
// Redacts AWS credentials, API keys, tokens, and PII from logs

const SECRET_PATTERNS = [
  // AWS credentials
  /AKIA[0-9A-Z]{16}/gi, // AWS Access Key ID
  /(?:aws_secret_access_key|secret[_-]?access[_-]?key)[\s:=]+[^\s]{20,}/gi,
  /(?:aws_session_token|session[_-]?token)[\s:=]+[^\s]{100,}/gi,

  // API keys
  /(?:api[_-]?key|apikey)[\s:=]+[^\s]{20,}/gi,
  /(?:bearer|token)[\s:=]+[^\s]{20,}/gi,

  // Gemini API key
  /AIza[0-9A-Za-z_-]{35}/gi,

  // Supabase keys
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, // JWT tokens

  // Generic secrets
  /(?:password|passwd|pwd)[\s:=]+[^\s]{8,}/gi,
  /(?:secret|private[_-]?key)[\s:=]+[^\s]{20,}/gi,
];

const REDACTION_TEXT = "[REDACTED]";

export function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTION_TEXT);
  }
  return redacted;
}

export function redactObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return redactSecrets(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  if (obj && typeof obj === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact sensitive keys entirely
      const keyLower = key.toLowerCase();
      if (
        keyLower.includes("password") ||
        keyLower.includes("secret") ||
        keyLower.includes("token") ||
        keyLower.includes("apikey") ||
        keyLower.includes("api_key") ||
        keyLower.includes("credentials")
      ) {
        redacted[key] = REDACTION_TEXT;
      } else {
        redacted[key] = redactObject(value);
      }
    }
    return redacted;
  }

  return obj;
}

export function safeStringify(obj: unknown): string {
  try {
    const redacted = redactObject(obj);
    return JSON.stringify(redacted, null, 2);
  } catch {
    return "[Unable to stringify]";
  }
}

// Generic error for clients (never expose internal details)
export function createSafeClientError(
  message: string = "An error occurred",
  status: number = 500,
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      message:
        "An internal error occurred. Please try again later or contact support if the issue persists.",
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

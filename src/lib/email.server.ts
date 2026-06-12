import process from "node:process";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmailViaResend(
  params: SendEmailParams,
  customApiKey?: string | null,
  customFromEmail?: string | null
) {
  const apiKey = customApiKey || process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Cirrus Email] No Resend API key provided (neither custom nor server-side env). Skipping email.");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  // Use custom sender address if provided, otherwise check env, fallback to onboarding address.
  const fromEmail = customFromEmail || process.env.RESEND_FROM_EMAIL || "Cirrus Security <onboarding@resend.dev>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Cirrus Email] Failed to send email via Resend:", errText);
      return { ok: false, error: errText };
    }

    const resData = await response.json();
    return { ok: true, data: resData };
  } catch (error) {
    console.error("[Cirrus Email] Error sending email via Resend:", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

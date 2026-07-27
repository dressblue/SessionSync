// Transactional email via Resend's HTTP API (no SDK dependency — just fetch).
// Used for student personal-link invites. Facilitator account invites go
// through Clerk, not here.
//
// Config:
//   RESEND_API_KEY  — required to actually send (unset ⇒ sends are no-ops that
//                     report a clear "not configured" error).
//   EMAIL_FROM      — the From header, e.g. "SessionSync <invites@yourdomain>".
//                     Resend only delivers to arbitrary recipients from a
//                     VERIFIED domain; the default onboarding@resend.dev only
//                     reaches the Resend account owner's own address (test mode).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM =
  process.env.EMAIL_FROM || "SessionSync <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "Email isn't configured (set RESEND_API_KEY)." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

interface SendResetEmailOptions {
  toEmail:   string;
  resetLink: string;
  userName?: string;
}

/**
 * Sends a password reset email via the Resend API.
 *
 * Required env vars:
 *   RESEND_API_KEY      — from resend.com (free tier covers 3,000 emails/month)
 *   RESEND_FROM_EMAIL   — e.g. "POS System <noreply@yourdomain.com>"
 *   NEXT_PUBLIC_APP_URL — e.g. "https://my-project.vercel.app"
 */
export async function sendResetEmail({
  toEmail,
  resetLink,
  userName,
}: SendResetEmailOptions): Promise<void> {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@yourdomain.com';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured. Add it to your .env.local file.');
  }

  const greeting = userName ? `Hi ${userName},` : 'Hello,';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:28px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:.5px;">
                Password Reset Request
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;color:#374151;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">${greeting}</p>
              <p style="margin:0 0 24px;">
                We received a request to reset the password on your account.
                Click the button below to choose a new password:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${resetLink}"
                       style="background:#2563eb;color:#ffffff;padding:14px 32px;border-radius:6px;
                              text-decoration:none;font-size:16px;font-weight:600;display:inline-block;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warning box -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#fefce8;border:1px solid #fbbf24;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;font-size:13px;color:#92400e;line-height:1.6;">
                    <strong>⏰ This link expires in 15 minutes.</strong><br/>
                    <strong>🔒 Security notice:</strong> If you did not request a password
                    reset, you can safely ignore this email. Your password will not change.
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:20px;margin:0;">
                If the button above doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${resetLink}" style="color:#2563eb;word-break:break-all;font-size:11px;">
                  ${resetLink}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 40px;text-align:center;
                       font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
              This email was sent by the POS System. Do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    fromEmail,
      to:      [toEmail],
      subject: 'Reset your password — link expires in 15 minutes',
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

const { Resend } = require('resend');
const env = require('../config/env');
const { ApiError } = require('../middleware/errorMiddleware');

let client = null;

const getClient = () => {
  if (!env.resendApiKey) return null;
  if (!client) client = new Resend(env.resendApiKey);
  return client;
};

/**
 * Send a 6-digit verification code email via Resend.
 * Throws a friendly ApiError on any failure — Resend internals are never
 * surfaced to the client.
 */
const sendOtpEmail = async ({ toEmail, otp, name }) => {
  const resend = getClient();
  if (!resend || !env.emailFrom) {
    throw new ApiError('Unable to send verification email right now. Please try again.', 502);
  }

  const { data, error } = await resend.emails.send({
    from: env.emailFrom,
    to: toEmail,
    subject: 'Verify your ShramikSetu account',
    html: `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f6f7fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e9eaf0;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0;font-size:18px;font-weight:bold;color:#1f2937;">ShramikSetu</p>
                <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Cooperative Gig Services Platform</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;">
                <p style="margin:0;font-size:14px;color:#374151;">Hi ${name || 'there'},</p>
                <p style="margin:14px 0 0;font-size:14px;color:#374151;">Use the code below to verify your email address. It expires in <strong>5 minutes</strong>.</p>
                <p style="margin:22px 0 0;text-align:center;">
                  <span style="display:inline-block;background:#eef2ff;color:#4338ca;font-size:30px;font-weight:bold;letter-spacing:8px;padding:12px 22px;border-radius:10px;">${otp}</span>
                </p>
                <p style="margin:22px 0 0;font-size:12px;color:#9ca3af;">If you did not create this account, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });

  if (error) {
    throw new ApiError('Unable to send verification email right now. Please try again.', 502);
  }
  return data;
};

module.exports = { sendOtpEmail };
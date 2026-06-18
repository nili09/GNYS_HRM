import nodemailer from "nodemailer";

let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  if (!host || !port) return null;

  _transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
        : undefined,
  });
  return _transport;
}

export function isMailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

export async function sendMail({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) {
    console.log(`[mailer] SMTP not configured — skipping mail to ${to}: ${subject}`);
    return { status: "skipped", reason: "smtp_not_configured" };
  }

  const from = process.env.SMTP_FROM || `noreply@${process.env.SMTP_HOST}`;
  try {
    await transport.sendMail({ from, to, subject, html, text });
    return { status: "sent" };
  } catch (err) {
    console.error(`[mailer] Failed to send to ${to}: ${err.message}`);
    return { status: "failed", reason: err.message };
  }
}

export function sendWelcomeEmail({ to, name, loginEmail, tempPassword }) {
  const subject = "Your Genesys HRMS account is ready";
  const text = [
    `Hi ${name},`,
    "",
    "Your Genesys HRMS account has been created.",
    "",
    `Login: ${loginEmail}`,
    `Temporary password: ${tempPassword}`,
    "",
    "You will be prompted to set a new password on your first sign-in.",
    "",
    "— Genesys People Operations",
  ].join("\n");

  const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px;color:#010101">Welcome to Genesys HRMS</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your account has been created. Use the credentials below to sign in:</p>
  <table style="margin:16px 0;border-collapse:collapse">
    <tr><td style="padding:6px 16px 6px 0;color:#666">Login</td><td style="padding:6px 0;font-weight:600">${escapeHtml(loginEmail)}</td></tr>
    <tr><td style="padding:6px 16px 6px 0;color:#666">Temporary password</td><td style="padding:6px 0;font-weight:600;font-family:monospace">${escapeHtml(tempPassword)}</td></tr>
  </table>
  <p>You'll be prompted to set a new password on your first sign-in.</p>
  <p style="color:#999;font-size:13px;margin-top:24px">— Genesys People Operations</p>
</div>`;

  return sendMail({ to, subject, html, text });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function resetTransport() {
  _transport = null;
}

export function _setTransportForTest(t) {
  _transport = t;
}

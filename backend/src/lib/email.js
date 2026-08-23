import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendContactNotification({ name = 'Unknown', company = '', email = '', message = '', id = '' } = {}) {
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping notification.');
    return;
  }
  if (!FROM_EMAIL) {
    console.log('[email] FROM_EMAIL not set — skipping notification.');
    return;
  }
  if (!ADMIN_EMAIL) {
    console.log('[email] ADMIN_EMAIL not set — skipping notification.');
    return;
  }

  const safeMessage = typeof message === 'string' ? message : String(message || '');
  const htmlMessage = escapeHtml(safeMessage).replace(/\n/g, '<br/>');
  const safeName = escapeHtml(name);
  const safeCompany = escapeHtml(company || '');
  const safeEmail = escapeHtml(email);
  const safeId = escapeHtml(String(id));

  try {
    await resend.emails.send({
      from: `Alux Plaza <${FROM_EMAIL}>`,
      to: [ADMIN_EMAIL],
      subject: `New contact form submission #${safeId}`,
      html: `
        <h2>New Contact Submission</h2>
        <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
        ${safeCompany ? `<p><strong>Company:</strong> ${safeCompany}</p>` : ''}
        <p><strong>ID:</strong> ${safeId}</p>
        <hr/>
        <p>${htmlMessage}</p>
      `,
      text: `From: ${name}${company ? ` (${company})` : ''} (${email})\n\nMessage:\n${safeMessage}`,
    });
  } catch (err) {
    console.error('[email] error sending contact notification:', err);
  }
}

export async function sendNewDeviceAlert({ email = '', ip = '', userAgent = '' } = {}) {
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping new-device alert.');
    return;
  }
  if (!FROM_EMAIL) {
    console.log('[email] FROM_EMAIL not set — skipping new-device alert.');
    return;
  }
  if (!email) {
    console.log('[email] No recipient email — skipping new-device alert.');
    return;
  }

  const safeEmail = escapeHtml(email);
  const safeIp = escapeHtml(ip || 'unknown');
  const safeUserAgent = escapeHtml(userAgent || 'unknown');
  const when = new Date().toUTCString();

  try {
    await resend.emails.send({
      from: `Alux Plaza Security <${FROM_EMAIL}>`,
      to: [email],
      subject: 'New login from an unfamiliar device',
      html: `
        <h2>New Device Login</h2>
        <p>We noticed a login to your Alux Plaza account from a device or location we haven't seen before.</p>
        <p><strong>Time:</strong> ${when}</p>
        <p><strong>IP address:</strong> ${safeIp}</p>
        <p><strong>Device:</strong> ${safeUserAgent}</p>
        <hr/>
        <p>If this was you, no action is needed. If you don't recognize this activity, please change your password immediately and contact support.</p>
      `,
      text: `New device login detected for ${safeEmail}\nTime: ${when}\nIP: ${safeIp}\nDevice: ${safeUserAgent}\n\nIf this wasn't you, change your password immediately and contact support.`,
    });
  } catch (err) {
    console.error('[email] error sending new-device alert:', err);
  }
}

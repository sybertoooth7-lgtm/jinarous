import Resend from 'resend';

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

export async function sendContactNotification({ name = 'Unknown', email = '', message = '', id = '' } = {}) {
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
        <p><strong>ID:</strong> ${safeId}</p>
        <hr/>
        <p>${htmlMessage}</p>
      `,
      text: `From: ${name} (${email})\n\nMessage:\n${safeMessage}`,
    });
  } catch (err) {
    console.error('[email] error sending contact notification:', err);
  }
}

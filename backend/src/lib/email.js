import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function sendContactNotification({ name, email, message, id }) {
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

  await resend.emails.send({
    from: `Alux Plaza <${FROM_EMAIL}>`,
    to: ADMIN_EMAIL,
    subject: `New contact form submission #${id}`,
    html: `
      <h2>New Contact Submission</h2>
      <p><strong>From:</strong> ${name} (${email})</p>
      <p><strong>ID:</strong> ${id}</p>
      <hr/>
      <p>${message.replace(/\n/g, '<br/>')}</p>
    `,
    text: `From: ${name} (${email})\n\nMessage:\n${message}`,
  });
}

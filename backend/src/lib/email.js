function isSafeLink(link) {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && url.hostname === 'jinarous.vercel.app';
  } catch {
    return false;
  }
}

export async function sendVerificationEmail({ email = '', link = '' } = {}) {
  if (!email || !link) return;
  if (!isSafeLink(link)) {
    console.error('[email] Rejecting unsafe verification link');
    return;
  }

  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — would send verification to ${email}`);
    return;
  }
  if (!FROM_EMAIL) {
    console.log('[email] FROM_EMAIL not set — skipping verification email.');
    return;
  }

  try {
    await resend.emails.send({
      from: `Alux Plaza <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Verify your email address',
      html: `
        <h2>Welcome to Alux Plaza</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <p><a href="${escapeHtml(link)}">Verify email address</a></p>
        <p>This link expires in 24 hours.</p>
        <hr/>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      `,
      text: `Welcome to Alux Plaza. Verify your email: ${link.replace(/[\r\n]/g, '')}\n\nThis link expires in 24 hours.`,
    });
  } catch (err) {
    console.error('[email] error sending verification email:', err);
  }
}

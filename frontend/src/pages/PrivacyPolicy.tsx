import LegalPageLayout from '../components/LegalPageLayout';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="August 12, 2026">
      <p>
        Alux Plaza ("we", "us") is a cybersecurity consultancy based in Nairobi,
        Kenya. This policy explains what personal data we collect, why, and
        the rights you have over it, in line with the Kenya Data Protection
        Act, 2019.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">What we collect</h2>
      <p>
        Through our contact form, we collect your name, email address,
        company name (optional), and the message you submit. If you become a
        client, we additionally hold the account and compliance-tracking
        information needed to deliver our services, such as engagement
        records and checklist status.
      </p>
      <p>
        We do not use third-party advertising trackers or sell any data we
        collect to third parties.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Why we collect it</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>To respond to enquiries submitted through our contact form</li>
        <li>To deliver and manage active client engagements</li>
        <li>To maintain security logs necessary to protect our own systems</li>
      </ul>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">How long we keep it</h2>
      <p>
        Contact form submissions are retained for as long as reasonably
        necessary to respond to and follow up on the enquiry. Client account
        and engagement data is retained for the duration of the engagement
        and for a reasonable period afterward for record-keeping purposes,
        unless you request earlier deletion.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Your rights</h2>
      <p>
        Under the Kenya Data Protection Act, 2019, you have the right to
        access, correct, or request deletion of your personal data, and to
        object to or restrict certain processing. To exercise any of these
        rights, contact us using the details below.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Security</h2>
      <p>
        We apply reasonable technical and organizational measures to protect
        the data we hold, consistent with the same standards we recommend to
        our clients (see our{' '}
        <a href="/security" className="text-alux-cyan hover:underline">
          Security
        </a>{' '}
        page for more).
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Contact</h2>
      <p>
        Questions about this policy or your data can be sent to{' '}
        <span className="text-alux-cyan">privacy@aluxplaza.com</span>.
      </p>
    </LegalPageLayout>
  );
}

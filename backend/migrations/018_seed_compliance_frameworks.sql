-- Migration: 018_seed_compliance_frameworks.sql
-- Adds actual compliance control items mapped to NIST SP 800-53 Rev. 5,
-- PCI DSS v4.0, and the Kenya Data Protection Act 2019.
-- Run after all prior migrations (001–017).

-- Clean up placeholder items from migration 012 so we don't end up with
-- duplicate framework names ('PCI DSS' vs 'PCI DSS v4.0') and stale slugs.
DELETE FROM compliance_items WHERE item_key IN (
  'pci-firewall-config',
  'pci-default-passwords',
  'pci-data-encryption',
  'dpa-data-register',
  'dpa-consent-mechanism',
  'dpa-breach-notification',
  'nist-ir-plan',
  'nist-ir-contacts'
);

INSERT INTO compliance_items (framework, item_key, title, description, sort_order)
VALUES
  -- NIST SP 800-53 Rev. 5 — Incident Response (IR) Family
  ('NIST SP 800-53 Rev. 5', 'IR-1', 'Incident Response Policy and Procedures',
   'Establish an incident response policy and define procedures for detecting, reporting, and responding to security incidents.', 1),
  ('NIST SP 800-53 Rev. 5', 'IR-2', 'Incident Response Training',
   'Provide role-based training to personnel with incident response responsibilities.', 2),
  ('NIST SP 800-53 Rev. 5', 'IR-3', 'Incident Response Testing',
   'Test the incident response capability to determine its effectiveness.', 3),
  ('NIST SP 800-53 Rev. 5', 'IR-4', 'Incident Handling',
   'Implement an incident handling capability that includes preparation, detection, analysis, containment, eradication, and recovery.', 4),
  ('NIST SP 800-53 Rev. 5', 'IR-5', 'Incident Monitoring',
   'Track and document security incidents throughout their lifecycle.', 5),
  ('NIST SP 800-53 Rev. 5', 'IR-6', 'Incident Reporting',
   'Report incidents to designated authorities and affected parties in a timely manner.', 6),
  ('NIST SP 800-53 Rev. 5', 'IR-7', 'Incident Response Assistance',
   'Provide incident response support resources and external liaison capabilities.', 7),
  ('NIST SP 800-53 Rev. 5', 'IR-8', 'Incident Response Plan',
   'Develop, document, and maintain an organization-wide incident response plan.', 8),
  ('NIST SP 800-53 Rev. 5', 'IR-9', 'Information Spillage Response',
   'Respond to information spills by identifying, containing, and remediating affected systems.', 9),

  -- PCI DSS v4.0 — Top-level Requirements
  ('PCI DSS v4.0', 'REQ-1', 'Network Security Controls',
   'Install and maintain network security controls (NSCs) such as firewalls and routers.', 1),
  ('PCI DSS v4.0', 'REQ-2', 'Secure Configurations',
   'Apply secure configurations to all system components; change vendor-supplied defaults.', 2),
  ('PCI DSS v4.0', 'REQ-3', 'Protect Stored Account Data',
   'Keep cardholder data storage to a minimum and securely delete data when no longer needed.', 3),
  ('PCI DSS v4.0', 'REQ-4', 'Strong Cryptography for Transmission',
   'Use strong cryptography and security protocols to safeguard cardholder data during transmission.', 4),
  ('PCI DSS v4.0', 'REQ-5', 'Malware Defense',
   'Protect systems against malware and regularly update anti-malware solutions.', 5),
  ('PCI DSS v4.0', 'REQ-6', 'Secure Development and Patching',
   'Develop software securely and patch vulnerabilities in a timely manner.', 6),
  ('PCI DSS v4.0', 'REQ-7', 'Access Restrictions',
   'Restrict access to system components and cardholder data by business need to know.', 7),
  ('PCI DSS v4.0', 'REQ-8', 'User Identification and Authentication',
   'Identify users and authenticate access to system components.', 8),
  ('PCI DSS v4.0', 'REQ-8.3', 'Multi-Factor Authentication',
   'Require MFA for all remote and non-console administrative access into the CDE.', 9),
  ('PCI DSS v4.0', 'REQ-9', 'Physical Security',
   'Restrict physical access to cardholder data and systems.', 10),
  ('PCI DSS v4.0', 'REQ-10', 'Audit Trails',
   'Implement audit trails linking access to system components to individual users.', 11),
  ('PCI DSS v4.0', 'REQ-11', 'Security Testing',
   'Regularly test security systems and networks; perform vulnerability scans and penetration tests.', 12),
  ('PCI DSS v4.0', 'REQ-11.4', 'Penetration Testing',
   'Perform internal and external penetration testing at least annually and after significant changes.', 13),
  ('PCI DSS v4.0', 'REQ-12', 'Information Security Policy',
   'Maintain an information security policy addressing all PCI DSS requirements.', 14),

  -- Kenya Data Protection Act 2019
  ('Kenya DPA 2019', 'DP-1', 'Lawful, Fair and Transparent Processing',
   'Ensure personal data is processed lawfully, fairly, and in a transparent manner.', 1),
  ('Kenya DPA 2019', 'DP-2', 'Purpose Limitation',
   'Collect personal data for specified, explicit, and legitimate purposes only.', 2),
  ('Kenya DPA 2019', 'DP-3', 'Data Minimization',
   'Ensure personal data is adequate, relevant, and limited to what is necessary.', 3),
  ('Kenya DPA 2019', 'DP-4', 'Accuracy',
   'Keep personal data accurate and up to date where necessary.', 4),
  ('Kenya DPA 2019', 'DP-5', 'Storage Limitation',
   'Retain personal data only for as long as necessary for the intended purpose.', 5),
  ('Kenya DPA 2019', 'DP-6', 'Integrity and Confidentiality',
   'Process personal data in a manner that ensures appropriate security.', 6),
  ('Kenya DPA 2019', 'DP-7', 'Accountability',
   'Demonstrate compliance with data protection principles and maintain records.', 7),
  ('Kenya DPA 2019', 'DP-8', 'Data Subject Rights',
   'Enable data subjects to exercise their rights (access, rectification, erasure, objection).', 8),
  ('Kenya DPA 2019', 'DP-9', 'Data Breach Notification',
   'Notify the Data Protection Commissioner within 72 hours and affected data subjects without delay.', 9),
  ('Kenya DPA 2019', 'DP-10', 'Cross-Border Transfers',
   'Ensure adequate safeguards exist before transferring personal data outside Kenya.', 10),
  ('Kenya DPA 2019', 'DP-11', 'Data Protection Officer',
   'Appoint a Data Protection Officer where required by Section 37 of the Act.', 11),
  ('Kenya DPA 2019', 'DP-12', 'Data Protection Impact Assessment',
   'Conduct a DPIA for high-risk processing per Section 31 of the Act.', 12)

ON CONFLICT (item_key) DO NOTHING;

-- Migration 012: Compliance status tracker
-- Adds client accounts (separate login from admin_users) and a
-- checklist-style compliance tracker per client, per framework.

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The catalog of checklist items across the frameworks you already
-- reference in your service methodology docs. Seeded below with a
-- starter set — add more via INSERT as your methodology docs expand.
CREATE TABLE IF NOT EXISTS compliance_items (
  id SERIAL PRIMARY KEY,
  framework TEXT NOT NULL, -- e.g. 'PCI DSS', 'Kenya DPA 2019', 'NIST SP 800-61'
  item_key TEXT UNIQUE NOT NULL, -- stable slug, e.g. 'pci-req-1-firewall'
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- One row per (client, item) pair once that item has been assessed.
-- Absence of a row = "not yet assessed", distinct from "assessed and failing".
CREATE TABLE IF NOT EXISTS client_compliance_status (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES compliance_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'passing', 'failing', 'not_applicable')),
  notes TEXT,
  updated_by TEXT, -- admin email who last changed it
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_client_compliance_status_client ON client_compliance_status (client_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_framework ON compliance_items (framework);

-- Starter checklist items — trim or expand to match your actual
-- methodology docs (docs/compliance-readiness-methodology.md etc.)
INSERT INTO compliance_items (framework, item_key, title, description, sort_order) VALUES
  ('PCI DSS', 'pci-firewall-config', 'Firewall configuration reviewed', 'Network firewall rules documented and reviewed for cardholder data environment.', 1),
  ('PCI DSS', 'pci-default-passwords', 'No vendor default passwords/settings', 'All default credentials and security parameters changed before deployment.', 2),
  ('PCI DSS', 'pci-data-encryption', 'Cardholder data encrypted at rest', 'Stored cardholder data protected via strong cryptography.', 3),
  ('Kenya DPA 2019', 'dpa-data-register', 'Data processing register maintained', 'Register of processing activities kept per Section 48.', 1),
  ('Kenya DPA 2019', 'dpa-consent-mechanism', 'Lawful basis / consent mechanism documented', 'Consent or other lawful basis documented for each processing activity.', 2),
  ('Kenya DPA 2019', 'dpa-breach-notification', 'Breach notification procedure in place', 'Procedure to notify the Data Commissioner within required timeframe.', 3),
  ('NIST SP 800-61', 'nist-ir-plan', 'Incident response plan documented', 'Written IR plan covering preparation, detection, containment, eradication, recovery.', 1),
  ('NIST SP 800-61', 'nist-ir-contacts', 'IR contact list current', 'Escalation contacts and roles reviewed within the last 12 months.', 2)
ON CONFLICT (item_key) DO NOTHING;

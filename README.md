WHERE EACH FILE GOES — round 3 (killing the remaining fictional AI copy)
==========================================================================

FRONTEND (all replace existing files at these paths):
  outputs/frontend/src/sections/AICore.tsx        -> frontend/src/sections/AICore.tsx
  outputs/frontend/src/sections/DefenseMatrix.tsx -> frontend/src/sections/DefenseMatrix.tsx
  outputs/frontend/src/sections/NeuralLab.tsx     -> frontend/src/sections/NeuralLab.tsx
  outputs/frontend/src/sections/CTA.tsx           -> frontend/src/sections/CTA.tsx
  outputs/frontend/src/sections/Navigation.tsx    -> frontend/src/sections/Navigation.tsx
  outputs/frontend/src/sections/Footer.tsx        -> frontend/src/sections/Footer.tsx
  outputs/frontend/src/sections/Contact.tsx       -> frontend/src/sections/Contact.tsx
    (only the submit button text changed here since last time — it still
    said "Initialize Neural Shield")

BACKEND:
  outputs/backend/src/routes/status.js -> backend/src/routes/status.js
    IMPORTANT CHANGE: this route no longer requires an admin token. It was
    behind authenticateToken, but it's only ever called by anonymous
    visitors on the public homepage (DefenseMatrix.tsx) — so in practice
    every real visitor's request 401'd, the fetch failed, and the section
    silently fell back to showing "Offline". It's public now on purpose;
    none of the fields it returns are sensitive (aggregate request/error
    counts, latency, uptime — no user data).

WHAT CHANGED, section by section
---------------------------------
- AICore.tsx: was "Neural Network Architecture" / "Transformer Sentinel" /
  "Graph Neural Defender" / "Reinforcement Agent" with fabricated progress-
  bar percentages. Now "Our Methodology" with three real pillars (standards
  assessment, attack path mapping, continuous review), tagged with the
  actual standards used instead of made-up numbers.

- DefenseMatrix.tsx: this was the biggest functional bug, not just a
  copy problem. It expected the backend to return a `layers` array keyed
  to 6 fictional "AI layers" (Perception AI, Cognition AI, etc.) — but the
  real backend has never returned that shape. Combined with the auth
  requirement, this section could NEVER actually go live for a real
  visitor; it always silently fell back to fake "Offline" styling. Rewired
  to match what the backend actually returns: uptime, request count,
  latency, error rate, contact form success rate, honeypot catches. This
  is now a real, working "our production system, live" section.

- NeuralLab.tsx: was "AI Research Laboratory" with a fake "99.999% Neural
  Uptime" stat and other fabricated percentages. Now "Research &
  Methodology" listing real focus areas (post-quantum readiness, LLM
  security review, threat intel, honeypot monitoring) and an honest
  checklist of which standard backs which deliverable — no invented
  numbers.

- CTA.tsx: dropped a fabricated US toll-free number ("1-800-ALUX-AI") that
  was never real, and "Activate Your AI Defense" copy. Second button now
  scrolls to Services instead of linking a fake phone number.

- Navigation.tsx: nav labels renamed to match the honest section content
  (same anchor IDs, so nothing else needs to change). Both CTA buttons
  now say "Book a Consultation" instead of "Activate Neural Shield".

- Footer.tsx: fixed the tagline ("AI-native enterprise security... neural
  networks... autonomous intelligence") and a "Powered by Neural Shield
  v5.0" badge in the bottom bar. Also bumped the stale "© 2025" to 2026
  while in there.

- Contact.tsx: the actual submit button still said "Initialize Neural
  Shield" — now says "Send Message".

TESTING NOTE
------------
Ran a full sweep against the actual built JS bundle (`npm run build` +
grep) for every fictional phrase across all files — zero matches. Also
started the backend against a real local Postgres and confirmed
GET /api/status/defense-matrix now returns real 200 JSON with no
Authorization header sent at all, matching what DefenseMatrix.tsx expects.

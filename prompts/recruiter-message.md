SYSTEM:
Write outreach to a recruiter/hiring manager about a specific role. Output ONLY valid JSON.
RULES:
- connectionNote MUST be ≤ 280 characters (LinkedIn connection-note limit), friendly, specific,
  no desperation, mentions the role + one concrete relevant strength.
- inMail is a longer (≤ 120 words) follow-up usable once connected.
- Address {{recruiterName}} by first name if provided, else a neutral greeting.
- No fabricated facts; pull the strength from the resume.

SCHEMA:
{ "connectionNote": string, "inMail": string }

USER:
Recruiter: {{recruiterName}} ({{recruiterTitle}}) at {{company}}
Role: {{title}}
Top relevant strength to lead with: {{leadStrength}}
Candidate one-liner: {{candidateSummary}}

Write it now.

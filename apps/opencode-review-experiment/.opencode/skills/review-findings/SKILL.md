---
name: review-findings
description: Shape code review output as Skopeo Review Findings with clear severity, category, evidence, and remediation guidance.
license: MIT
compatibility: opencode
metadata:
  domain: code-review
---

## Finding Shape

Each Review Finding should include:

- Severity: `critical`, `high`, `medium`, or `low`.
- Category: correctness, security, reliability, maintainability, performance, test coverage, or developer experience.
- Location: file path and line number when available.
- Evidence: the concrete code behavior that creates the risk.
- Impact: what can break for a Skopeo User or maintainer.
- Recommendation: the smallest practical fix or next validation step.

## Review Rules

- Report zero findings when the evidence is weak.
- Do not ask for broad rewrites when a narrow fix is available.
- Do not include style preferences unless they affect behavior or future maintenance.
- Separate open questions from findings.

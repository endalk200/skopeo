# Container vulnerability policy

CI scans the final native AMD64 and ARM64 variants of both application images
for operating-system and application-library vulnerabilities. Every scan keeps
a machine-readable JSON report. Low and medium findings remain visible in that
report; high and critical findings block publication, including findings for
which no upstream fix is available.

The initial runtime-base exceptions are recorded in `.trivyignore.yaml`, scoped
to exact Debian package PURLs, justified by unreachable runtime behavior, and
set to expire on August 15, 2026. Any suppression may be added only to that file
and must contain all of the following:

- one vulnerability ID;
- either `paths` scoped to the affected installed path or `purls` scoped to the
  affected package;
- a `statement` explaining why the deployment risk is accepted; and
- an `expired_at` date in `YYYY-MM-DD` form.

Trivy stops applying a rule after its expiration date. CODEOWNERS protects this
policy and the ignore file, so each exception requires maintainer review. Broad,
unscoped rules and automatic suppression of unfixed findings are not accepted.
CI also rejects exceptions that omit scope, justification, or expiration and
includes a negative test proving that expired rules fail validation.

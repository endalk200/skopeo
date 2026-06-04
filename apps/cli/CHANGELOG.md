# @skopeo/cli

## 0.1.0

### Minor Changes

- Add the local Code Review Agent behind `skopeo review`, producing a Review Report for the current repository changes.
- Add repository-bound read and bash execution tools used by the Code Review Agent, with guarded path handling, bounded output, deterministic bash execution, cancellation, and timeout cleanup.
- Add internal fast and deep review profiles for model-driven analysis while keeping provider and profile controls out of the public CLI surface.

### Patch Changes

- Harden Review Target collection for renamed, copied, deleted, and dot-prefixed repository paths.
- Improve telemetry collector preflight behavior by tolerating collectors that do not implement `OPTIONS` while still rejecting unexpected collector status codes.
- Upgrade Effect packages to `4.0.0-beta.78`.
- Document the CI and npm release pipeline, including release PR review, staged npm publishing, provenance, and GitHub Release publication.
- Add tool input schema descriptions and examples so model calls receive clearer path, line range, command, working directory, and timeout guidance.
- Strengthen CLI, Review Agent, and tool package tests around runtime cleanup, truncation, schema validation, repository boundaries, and process cancellation.

## 0.0.1

### Patch Changes

- 4544eba: initial release

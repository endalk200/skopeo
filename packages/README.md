# Package groups

Deployable applications live under `apps/`. Internal packages are grouped by their allowed consumers:

- `api/` — packages owned by the hosted API runtime
- `cli/` — packages owned by the local CLI runtime
- `web/` — packages owned by the web runtime
- `shared/` — domain packages with multiple runtime consumers
- `tooling/` — repository build and quality configuration

Package names remain domain-oriented; the directory communicates ownership and dependency direction. A module should stay inside its application until an independent package gives it concrete build, testing, ownership, or reuse leverage.

Runtime-specific packages may depend on `shared/` and `tooling/`. Shared packages may depend on other shared packages and tooling, but never on runtime-specific packages. These directions are enforced by Turborepo package tags.

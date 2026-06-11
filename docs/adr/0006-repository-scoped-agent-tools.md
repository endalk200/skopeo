# Repository-Scoped Agent Tools

Status: Accepted

Skopeo Agent Tools live in the shared `@skopeo/tools` package, which owns both the Effect-native services and the TanStack AI tool-definition factories. The Code Review Agent imports those factories and builds a per-review Effect runner with an `AgentToolPolicy` bound to the Git-resolved Repository Root.

The policy centralizes approval for file reads and shell commands instead of scattering guard logic inside each tool. Tool inputs may use absolute or relative paths, but relative paths resolve from the Repository Root, and policy checks use canonical real paths so symlinks cannot escape the repository boundary.

The first read guard blocks common secret-bearing files and local credential directories. The first bash guard blocks destructive filesystem commands and permission or ownership changes, runs through Effect child-process services with scoped cleanup, and enforces hardcoded timeout bounds. Broader policy controls, output caps, and user configuration are intentionally deferred until real review usage shows what flexibility Skopeo needs.

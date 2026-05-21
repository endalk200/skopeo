# Opt-in OpenTelemetry for CLI Observability

Status: Amended by [0003 Shared Skopeo Configuration Package](./0003-shared-skopeo-configuration-package.md)

Skopeo's CLI exports observability data only when `SKOPEO_TELEMETRY=true`.
When the variable is unset or set to `false`, telemetry is disabled and Effect's
default console loggers are removed so application logs do not appear in stdout.
Any other value fails startup.

Telemetry uses the local OTLP HTTP collector at `http://localhost:4318` by
default, sending traces to `/v1/traces` and logs to `/v1/logs`. Skopeo Users can
override the base endpoint with `SKOPEO_OTLP_ENDPOINT` for collectors that bind
to a dynamic local port. The CLI checks that the local collector is reachable
before running a command when telemetry is enabled.

We chose an explicit boolean opt-in because the CLI runs on developer machines
and should not export logs or traces unless the Skopeo User asks for it. We also
chose OTLP over console logging because command stdout is a user interface and
must stay script-friendly. Logs are therefore an observability signal, not CLI
output.

Amendment: Telemetry remains explicit opt-in, but the opt-in value may now come
from Skopeo Configuration at `~/.skopeo/config.toml`. Environment variables
continue to override file configuration, and `SKOPEO_TELEMETRY` remains the
highest-precedence telemetry enablement override.

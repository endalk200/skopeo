# Separate AI SDK DevTools from OTLP Telemetry

Skopeo has two independent observability controls: `[telemetry]` for exported
OpenTelemetry traces and logs, and `[devtools]` for local AI SDK DevTools
capture. `[devtools].enabled` defaults to `false`, can be overridden with
`SKOPEO_DEVTOOLS=true|false`, and does not enable or require OTLP telemetry.

AI SDK DevTools is persisted in Skopeo Configuration because it is a user-facing
debugging mode, but it remains separate from telemetry because it records full
AI SDK interactions into local `.devtools` data while OTLP telemetry should
avoid prompts, tool outputs, diffs, and model responses by default. If DevTools
is enabled in a production environment, Skopeo disables it for that run and
warns instead of letting the DevTools middleware fail the review.

Review observability is owned at Effect service boundaries. The Code Review
Agent owns the `skopeo.review` lifecycle span and model-execution telemetry,
while `@skopeo/tools` owns generic `skopeo.tool.read` and `skopeo.tool.bash`
spans so repository tools stay reusable outside review workflows. DevTools
wrapping is scoped to the current Code Review Agent AI SDK model boundary; new
AI SDK workflows must opt into the same configuration deliberately.

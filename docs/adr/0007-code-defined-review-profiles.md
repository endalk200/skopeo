# Code-Defined Review Profiles

Status: Accepted

A Review Profile bundles everything that shapes Code Review Agent behavior for one (Review Depth, model) pairing: the model, its reasoning configuration, the model-tuned system and user prompts, and the agent-loop budget. Profiles live in code under `packages/agents/code-review/src/profiles/`, one self-contained folder per model, behind a registry keyed by Review Depth and model.

Prompts and tuning are never shared between models — not even between same-generation siblings like GPT-5.5 and GPT-5.4, whose prompt files are currently near-identical copies. Vendor guidance shows prompt patterns that help one model degrade another (Claude Opus 4.8 literally suppresses Review Findings when given severity filters; GPT-5.x over-explores without explicit stop rules and retrieval budgets), and each model's prompts must drift independently as it is evaluated. Do not consolidate the duplicated prompt files; the duplication is the accepted cost of that independence. Only genuinely model-agnostic fragments (Agent Tool policy, git target instructions) live in the shared prompts module.

Considered and rejected: grouping profiles by Review Depth with models inside (depth is a parameter into per-model tuning tables, while the vendor call, options shape, and quirks are all model-determined — the model carries the identity); family-shared prompt modules (blocks independent drift and hides which models an edit affects); and a common executor abstraction over the vendor chat calls (vendor differences are the substance of each profile, not noise to hide).

Switching the active Review Profile is a deliberate one-line code edit, not a CLI flag or Skopeo Configuration, even though the shared configuration package (ADR 0003) could carry it. While profiles are being evaluated, a profile change alters review quality and cost and should land as a reviewed commit. Configuration-driven selection is deferred until the profile set stabilizes.

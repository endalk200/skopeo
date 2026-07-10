# Domain Docs

This is a multi-context repository. Engineering skills should resolve the relevant domain context before exploring or changing code.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repository root. It maps code areas and topics to their context-specific `CONTEXT.md` files.
- Each **relevant context's `CONTEXT.md`** identified by that map.
- **`CONTEXT.md`** at the repository root, if retained, for terminology that applies across contexts.
- **`docs/adr/`** for system-wide architectural decisions.
- Each relevant context's ADR directory, as identified by `CONTEXT-MAP.md`, for context-scoped decisions.

If a file does not exist, proceed silently. Do not suggest creating it upfront. The `domain-modeling` skill creates domain documentation lazily when terms or decisions are resolved.

## File structure

The intended layout is:

```
/
├── CONTEXT-MAP.md
├── CONTEXT.md                    ← optional system-wide vocabulary
├── docs/adr/                     ← system-wide decisions
└── <context locations>/
    ├── CONTEXT.md
    └── docs/adr/                 ← context-specific decisions
```

`CONTEXT-MAP.md` is authoritative for context names and locations. Do not infer that technical package boundaries are domain-context boundaries.

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined by the relevant `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a needed concept is absent, either reconsider whether the project uses that concept or record the gap for `domain-modeling`.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than silently overriding the decision.

# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

PRs do not enter the triage queue. GitHub shares one number space across issues and PRs, so resolve an ambiguous `#42` with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `wayfinder`. The **map** is a single issue with **child** issues as tickets.

Resolve every canonical `wayfinder:*` role through `docs/agents/triage-labels.md`.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes, Decisions-so-far, and Fog sections.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue. Where sub-issues are unavailable, add the child to a task list in the map and put `Part of #<map>` at the top of its body.
- **Blocking**: use GitHub's native issue dependencies. Where dependencies are unavailable, use a `Blocked by: #<n>` line at the top of the child body.
- **Frontier query**: list the map's open children and exclude tickets with open blockers or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: comment with the answer, close the ticket, then append a context pointer to the map's Decisions-so-far.

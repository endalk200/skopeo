#!/usr/bin/env bash

set -euo pipefail

branch="${1:?Pass the release branch name}"
number="$(
	gh pr list \
		--head "${branch}" \
		--state open \
		--json number \
		--jq 'if length == 1 then .[0].number else empty end'
)"

if [[ -n "${number}" && ! "${number}" =~ ^[0-9]+$ ]]; then
	echo "GitHub returned an invalid pull request number for ${branch}: ${number}." >&2
	exit 1
fi

printf '%s\n' "${number}"

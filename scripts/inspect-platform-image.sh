#!/usr/bin/env bash

set -euo pipefail

optional=false
if [[ "${1:-}" == "--optional" ]]; then
	optional=true
	shift
fi

reference="${1:?Pass an image reference to inspect}"

if ! inspection="$(docker buildx imagetools inspect "${reference}" 2>&1)"; then
	if [[ "${optional}" == true ]] &&
		{ grep -Eiq '(: not found|manifest unknown)' <<< "${inspection}" || grep -Fxqi 'release not found' <<< "${inspection}"; }; then
		exit 0
	fi
	printf '%s\n' "${inspection}" >&2
	exit 1
fi

digest="$(awk '/^Digest:/ { print $2; exit }' <<< "${inspection}")"
if [[ ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
	echo "Registry inspection returned an invalid digest for ${reference}: ${digest:-<empty>}." >&2
	exit 1
fi

printf '%s\n' "${digest}"

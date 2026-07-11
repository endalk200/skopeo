#!/usr/bin/env bash

set -euo pipefail

reference="${1:?Pass an image reference to inspect}"
platform="${2:?Pass the expected platform (for example linux/amd64)}"
os="${platform%%/*}"
architecture="${platform#*/}"

if [[ -z "${os}" || -z "${architecture}" || "${os}" == "${architecture}" ]]; then
	echo "Invalid platform ${platform}; expected os/architecture." >&2
	exit 1
fi

manifest="$(docker buildx imagetools inspect "${reference}" --raw)"
config_digest="$(jq --raw-output '.config.digest // empty' <<< "${manifest}")"

if [[ -z "${config_digest}" ]]; then
	manifest_digest="$(
		jq --raw-output \
			--arg os "${os}" \
			--arg architecture "${architecture}" \
			'[
				.manifests[]
				| select(.platform.os == $os and .platform.architecture == $architecture)
				| .digest
			] | if length == 1 then .[0] else empty end' \
			<<< "${manifest}"
	)"
	if [[ ! "${manifest_digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
		echo "Expected exactly one ${platform} image manifest in ${reference}." >&2
		exit 1
	fi
	manifest="$(docker buildx imagetools inspect "${reference%@*}@${manifest_digest}" --raw)"
	config_digest="$(jq --raw-output '.config.digest // empty' <<< "${manifest}")"
fi

if [[ ! "${config_digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
	echo "Registry inspection returned an invalid config digest for ${reference}: ${config_digest:-<empty>}." >&2
	exit 1
fi

printf '%s\n' "${config_digest}"

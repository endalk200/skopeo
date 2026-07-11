#!/usr/bin/env bash

set -euo pipefail

image="${1:?Image reference is required}"
digest="${2:?Image digest is required}"

: "${GITHUB_REPOSITORY_OWNER:?GITHUB_REPOSITORY_OWNER is required}"

package="${image##*/}"
owner_type="$(gh api "/users/${GITHUB_REPOSITORY_OWNER}" --jq .type)"
case "${owner_type}" in
	Organization) versions_endpoint="/orgs/${GITHUB_REPOSITORY_OWNER}/packages/container/${package}/versions" ;;
	User) versions_endpoint="/users/${GITHUB_REPOSITORY_OWNER}/packages/container/${package}/versions" ;;
	*)
		echo "Unsupported GitHub package owner type: ${owner_type}." >&2
		exit 1
		;;
esac

versions="$(gh api --paginate --slurp "${versions_endpoint}?per_page=100")"
matching_versions="$(
	jq --compact-output --arg digest "${digest}" \
		'[.[][] | select(.name == $digest)] | unique_by(.id)' <<< "${versions}"
)"
version_count="$(jq length <<< "${matching_versions}")"
if [[ "${version_count}" != 1 ]]; then
	echo "Expected one ${package} package version for ${digest}, found ${version_count}." >&2
	exit 1
fi

jq --compact-output '.[0]' <<< "${matching_versions}"

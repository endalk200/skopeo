#!/usr/bin/env bash

set -euo pipefail

image="${1:?Image reference is required}"
digest="${2:?Image digest is required}"
shift 2
allowed_tags=("$@")

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_version="$(bash "${script_dir}/inspect-platform-package-version.sh" "${image}" "${digest}")"

tag_allowed() {
	local candidate="$1"
	local allowed
	for allowed in "${allowed_tags[@]}"; do
		if [[ "${allowed}" == regex:* ]]; then
			[[ "${candidate}" =~ ${allowed#regex:} ]] && return 0
		elif [[ "${candidate}" == "${allowed}" ]]; then
			return 0
		fi
	done
	return 1
}

while IFS= read -r tag; do
	if ! tag_allowed "${tag}"; then
		echo "Refusing to delete ${image}@${digest}: tag ${tag} predates this publication attempt." >&2
		exit 1
	fi
done < <(jq --raw-output '.metadata.container.tags[]?' <<< "${package_version}")

version_url="$(jq --raw-output .url <<< "${package_version}")"
gh api --method DELETE "${version_url}"

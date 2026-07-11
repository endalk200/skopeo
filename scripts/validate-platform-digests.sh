#!/usr/bin/env bash

set -euo pipefail

digest_dir="${1:?Digest directory is required}"

for app in api web; do
	for arch in amd64 arm64; do
		digest_file="${digest_dir}/digest-${app}-${arch}.txt"
		if [[ ! -f "${digest_file}" ]] || ! grep -Eq '^sha256:[0-9a-f]{64}$' "${digest_file}"; then
			echo "Missing or invalid final digest: ${digest_file}" >&2
			exit 1
		fi
		done
done

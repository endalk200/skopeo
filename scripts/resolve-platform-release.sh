#!/usr/bin/env bash

set -euo pipefail

api_version="${1:?API version is required}"
web_version="${2:?Web version is required}"
previous_api_version="${3:-${api_version}}"
previous_web_version="${4:-${web_version}}"

if [[ "${api_version}" != "${web_version}" ]]; then
	echo "API ${api_version} and web ${web_version} Platform Release versions disagree." >&2
	exit 1
fi

api_changed=false
web_changed=false
[[ "${api_version}" != "${previous_api_version}" ]] && api_changed=true
[[ "${web_version}" != "${previous_web_version}" ]] && web_changed=true
if [[ "${api_changed}" != "${web_changed}" ]]; then
	echo "A stable Platform Release must change both application versions together." >&2
	exit 1
fi

echo "stable=${api_changed}"
echo "version=${api_version}"

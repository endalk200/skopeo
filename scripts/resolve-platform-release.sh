#!/usr/bin/env bash

set -euo pipefail

api_version="${1:?API version is required}"
web_version="${2:?Web version is required}"
previous_api_version="${3:-${api_version}}"
previous_web_version="${4:-${web_version}}"
api_version_tag_published="${5:-}"
web_version_tag_published="${6:-}"
github_release_published="${7:-}"

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

if [[ -n "${api_version_tag_published}" || -n "${web_version_tag_published}" || -n "${github_release_published}" ]]; then
	for publication_state in \
		"${api_version_tag_published}" \
		"${web_version_tag_published}" \
		"${github_release_published}"; do
		if [[ "${publication_state}" != true && "${publication_state}" != false ]]; then
			echo "Publication state must be true or false." >&2
			exit 1
		fi
	done

	stable=false
	if [[ "${api_version_tag_published}" == false || "${web_version_tag_published}" == false || "${github_release_published}" == false ]]; then
		stable=true
	fi
	repair=false
	[[ "${api_version_tag_published}" != "${web_version_tag_published}" ]] && repair=true
	echo "stable=${stable}"
	echo "repair=${repair}"
else
	echo "stable=${api_changed}"
fi
echo "version=${api_version}"

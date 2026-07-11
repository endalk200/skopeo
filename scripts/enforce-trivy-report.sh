#!/usr/bin/env bash

set -euo pipefail

report_file="${1:?Pass the Trivy JSON report path}"

jq --raw-output '
	.Results[]?.Vulnerabilities[]?
	| select(.Severity == "HIGH" or .Severity == "CRITICAL")
	| "\(.Severity) \(.VulnerabilityID) \(.PkgName)@\(.InstalledVersion)"
' "${report_file}"

blocking_findings="$(
	jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH" or .Severity == "CRITICAL")] | length' \
		"${report_file}"
)"

if [[ "${blocking_findings}" != 0 ]]; then
	echo "Trivy found ${blocking_findings} blocking HIGH or CRITICAL vulnerabilities." >&2
	exit 1
fi

#!/usr/bin/env bash

set -euo pipefail

ignore_file="${1:-.trivyignore.yaml}"
today="${TRIVY_POLICY_DATE:-$(date -u +%F)}"

awk -v today="${today}" '
	function validate_rule() {
		if (id == "") return
		if (!scoped || statement == "" || expiration == "") {
			printf "Trivy exception %s must have purls/paths, a statement, and expired_at.\n", id > "/dev/stderr"
			failed = 1
		}
		if (expiration != "" && expiration !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) {
			printf "Trivy exception %s has an invalid expired_at date: %s.\n", id, expiration > "/dev/stderr"
			failed = 1
		}
		if (expiration != "" && expiration < today) {
			printf "Trivy exception %s expired on %s.\n", id, expiration > "/dev/stderr"
			failed = 1
		}
	}
	/^  - id: / {
		validate_rule()
		id = $3
		scoped = 0
		scope_block = 0
		statement = ""
		expiration = ""
		next
	}
	/^    (purls|paths):[[:space:]]*$/ { scope_block = 1; next }
	/^      -[[:space:]]+[^[:space:]]/ {
		if (scope_block) scoped = 1
		next
	}
	/^    statement: / { scope_block = 0; statement = substr($0, 16); next }
	/^    expired_at: / { scope_block = 0; expiration = $2; next }
	/^    [[:alnum:]_]+:/ { scope_block = 0; next }
	END {
		validate_rule()
		exit failed
	}
' "${ignore_file}"

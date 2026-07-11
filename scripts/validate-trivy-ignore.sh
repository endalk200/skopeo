#!/usr/bin/env bash

set -euo pipefail

ignore_file="${1:-.trivyignore.yaml}"
today="${TRIVY_POLICY_DATE:-$(date -u +%F)}"

# The JavaScript program is intentionally single-quoted so the shell cannot expand it.
# shellcheck disable=SC2016
bun -e '
	const [ignoreFile, today] = process.argv.slice(1);
	const document = Bun.YAML.parse(await Bun.file(ignoreFile).text());
	const rules = document?.vulnerabilities;
	if (!Array.isArray(rules) || rules.length === 0) {
		console.error("Trivy policy must contain at least one vulnerability exception.");
		process.exit(1);
	}

	const validDate = (value) => {
		if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
		const [year, month, day] = value.split("-").map(Number);
		const date = new Date(Date.UTC(year, month - 1, day));
		return date.getUTCFullYear() === year
			&& date.getUTCMonth() === month - 1
			&& date.getUTCDate() === day;
	};

	let failed = false;
	for (const rule of rules) {
		const id = typeof rule?.id === "string" && rule.id !== "" ? rule.id : "<missing id>";
		const scoped = [rule?.purls, rule?.paths].some((scope) => Array.isArray(scope) && scope.length > 0);
		const statement = rule?.statement;
		const expiration = rule?.expired_at;
		if (!scoped || typeof statement !== "string" || statement === "" || expiration === undefined) {
			console.error(`Trivy exception ${id} must have purls/paths, a statement, and expired_at.`);
			failed = true;
		}
		if (!validDate(expiration)) {
			console.error(`Trivy exception ${id} has an invalid expired_at date: ${String(expiration)}.`);
			failed = true;
		} else if (expiration < today) {
			console.error(`Trivy exception ${id} expired on ${expiration}.`);
			failed = true;
		}
	}
	if (failed) process.exit(1);
' "${ignore_file}" "${today}"

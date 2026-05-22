import { spawnSync } from "node:child_process";

type Advisory = {
	readonly severity: "low" | "moderate" | "high" | "critical";
	readonly title: string;
	readonly url: string;
};

type AuditReport = Record<string, ReadonlyArray<Advisory>>;

const devOnlyModerateAdvisoryPackages = new Set(["hono"]);
const severityRank = {
	low: 0,
	moderate: 1,
	high: 2,
	critical: 3,
} as const satisfies Record<Advisory["severity"], number>;

const audit = spawnSync("bun", ["audit", "--json", "--audit-level=moderate"], {
	encoding: "utf8",
	stdio: ["ignore", "pipe", "pipe"],
});

if (audit.status === 0) {
	console.log("Release dependency audit passed.");
	process.exit(0);
}

const jsonStart = audit.stdout.indexOf("{");

if (jsonStart === -1) {
	throw new Error(`Could not parse bun audit JSON output:\n${audit.stdout}\n${audit.stderr}`);
}

const report = JSON.parse(audit.stdout.slice(jsonStart)) as AuditReport;
const failures: Array<string> = [];
const warnings: Array<string> = [];

for (const [packageName, advisories] of Object.entries(report)) {
	for (const advisory of advisories) {
		const isDevOnlyModerate = advisory.severity === "moderate" && devOnlyModerateAdvisoryPackages.has(packageName);

		if (
			severityRank[advisory.severity] >= severityRank.high ||
			(advisory.severity === "moderate" && !isDevOnlyModerate)
		) {
			failures.push(`${packageName}: ${advisory.severity} - ${advisory.title} (${advisory.url})`);
			continue;
		}

		if (isDevOnlyModerate) {
			warnings.push(
				`${packageName}: ${advisory.severity} dev-only advisory - ${advisory.title} (${advisory.url})`,
			);
		}
	}
}

for (const warning of warnings) {
	console.warn(`Release audit warning: ${warning}`);
}

if (failures.length > 0) {
	throw new Error(`Release dependency audit failed:\n${failures.join("\n")}`);
}

console.log("Release dependency audit passed with dev-only warnings.");

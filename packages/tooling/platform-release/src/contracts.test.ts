import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");
const script = (name: string) => path.join(repositoryRoot, "scripts", name);
const run = (name: string, args: ReadonlyArray<string>) =>
	execFileSync("bash", [script(name), ...args], {
		cwd: repositoryRoot,
		encoding: "utf8",
	});

describe("Platform Release contract", () => {
	it("distinguishes edge commits from a shared stable version change", () => {
		expect(run("resolve-platform-release.sh", ["0.2.0", "0.2.0", "0.2.0", "0.2.0"])).toBe(
			"stable=false\nversion=0.2.0\n",
		);
		expect(run("resolve-platform-release.sh", ["0.2.0", "0.2.0", "0.1.0", "0.1.0"])).toBe(
			"stable=true\nversion=0.2.0\n",
		);
	});

	it("rejects mismatched or partially changed application versions", () => {
		expect(() => run("resolve-platform-release.sh", ["0.2.0", "0.3.0"])).toThrow();
		expect(() => run("resolve-platform-release.sh", ["0.2.0", "0.2.0", "0.1.0", "0.2.0"])).toThrow();
	});

	it("derives Platform Release publication from durable state", () => {
		expect(
			run("resolve-platform-release.sh", ["0.2.0", "0.2.0", "0.1.0", "0.1.0", "false", "false", "false"]),
		).toBe("stable=true\nrepair=false\nversion=0.2.0\n");
		expect(run("resolve-platform-release.sh", ["0.2.0", "0.2.0", "0.2.0", "0.2.0", "true", "true", "true"])).toBe(
			"stable=false\nrepair=false\nversion=0.2.0\n",
		);
		expect(run("resolve-platform-release.sh", ["0.2.0", "0.2.0", "0.2.0", "0.2.0", "true", "false", "false"])).toBe(
			"stable=true\nrepair=true\nversion=0.2.0\n",
		);
	});

	it("rejects an incomplete final architecture pair", () => {
		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-platform-digests-"));
		const digest = `sha256:${"0".repeat(64)}\n`;
		try {
			for (const app of ["api", "web"]) {
				for (const arch of ["amd64", "arm64"]) {
					writeFileSync(path.join(fixture, `digest-${app}-${arch}.txt`), digest);
				}
			}
			expect(() => run("validate-platform-digests.sh", [fixture])).not.toThrow();
			rmSync(path.join(fixture, "digest-web-arm64.txt"));
			expect(() => run("validate-platform-digests.sh", [fixture])).toThrow();
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it("rejects an expired vulnerability exception", () => {
		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-trivy-policy-"));
		const ignoreFile = path.join(fixture, ".trivyignore.yaml");
		try {
			writeFileSync(
				ignoreFile,
				[
					"vulnerabilities:",
					"  - id: CVE-EXPIRED",
					"    purls:",
					"      - pkg:example/package@1.0.0",
					"    statement: Deliberately expired test fixture.",
					"    expired_at: 2000-01-01",
				].join("\n"),
			);
			expect(() => run("validate-trivy-ignore.sh", [ignoreFile])).toThrow();
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it("accepts the checked-in vulnerability policy and rejects an empty scope", () => {
		expect(() => run("validate-trivy-ignore.sh", [path.join(repositoryRoot, ".trivyignore.yaml")])).not.toThrow();

		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-trivy-policy-"));
		const ignoreFile = path.join(fixture, ".trivyignore.yaml");
		try {
			writeFileSync(
				ignoreFile,
				[
					"vulnerabilities:",
					"  - id: CVE-UNSCOPED",
					"    purls:",
					"    statement: An empty list must not count as package scope.",
					"    expired_at: 2099-01-01",
				].join("\n"),
			);
			expect(() => run("validate-trivy-ignore.sh", [ignoreFile])).toThrow();
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it("rejects invalid dates, empty policies, and accepts valid YAML indentation", () => {
		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-trivy-policy-"));
		const ignoreFile = path.join(fixture, ".trivyignore.yaml");
		try {
			writeFileSync(ignoreFile, "vulnerabilities: []\n");
			expect(() => run("validate-trivy-ignore.sh", [ignoreFile])).toThrow();

			writeFileSync(
				ignoreFile,
				[
					"vulnerabilities:",
					"    - id: CVE-BAD-DATE",
					"      purls:",
					"        - pkg:example/package@1.0.0",
					"      statement: Invalid calendar date fixture.",
					"      expired_at: 2099-02-30",
				].join("\n"),
			);
			expect(() => run("validate-trivy-ignore.sh", [ignoreFile])).toThrow();

			writeFileSync(
				ignoreFile,
				[
					"vulnerabilities:",
					"    - id: CVE-VALID",
					"      paths:",
					"        - /usr/bin/example",
					"      statement: Deeper indentation remains valid YAML.",
					"      expired_at: 2099-02-28",
				].join("\n"),
			);
			expect(() => run("validate-trivy-ignore.sh", [ignoreFile])).not.toThrow();
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it("deletes only package versions whose tags belong to the failed publication", () => {
		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-package-delete-"));
		const mockGh = path.join(fixture, "gh");
		const calls = path.join(fixture, "calls.log");
		const digest = `sha256:${"a".repeat(64)}`;
		try {
			writeFileSync(
				mockGh,
				`#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"/users/test-owner"* && "$*" != *"/packages/"* ]]; then
	printf 'User\\n'
elif [[ "$*" == *"--method DELETE"* ]]; then
	printf '%s\\n' "$*" >> "${calls}"
else
	printf '[[{"id":42,"name":"${digest}","url":"https://api.github.test/version/42","metadata":{"container":{"tags":["candidate-test","sha-test"]}}}]]'
fi
`,
			);
			chmodSync(mockGh, 0o755);
			const runDelete = (allowedTags: ReadonlyArray<string>) =>
				execFileSync(
					"bash",
					[
						script("delete-platform-image-version.sh"),
						"ghcr.io/test-owner/skopeo-api",
						digest,
						...allowedTags,
					],
					{
						cwd: repositoryRoot,
						env: {
							...process.env,
							GITHUB_REPOSITORY_OWNER: "test-owner",
							PATH: `${fixture}:${process.env.PATH}`,
						},
					},
				);
			runDelete(["candidate-test", "sha-test"]);
			expect(readFileSync(calls, "utf8")).toContain("https://api.github.test/version/42");
			expect(() => runDelete(["candidate-test"])).toThrow();
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it("resolves a native config digest through an attested image index", () => {
		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-image-config-"));
		const mockDocker = path.join(fixture, "docker");
		const imageDigest = `sha256:${"a".repeat(64)}`;
		const attestationDigest = `sha256:${"b".repeat(64)}`;
		const configDigest = `sha256:${"c".repeat(64)}`;
		try {
			writeFileSync(
				mockDocker,
				`#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"${imageDigest}"* ]]; then
	printf '{"config":{"digest":"${configDigest}"}}'
else
	printf '{"manifests":[{"digest":"${imageDigest}","platform":{"os":"linux","architecture":"amd64"}},{"digest":"${attestationDigest}","platform":{"os":"unknown","architecture":"unknown"}}]}'
fi
`,
			);
			chmodSync(mockDocker, 0o755);
			const output = execFileSync(
				"bash",
				[
					script("inspect-platform-image-config.sh"),
					`ghcr.io/example/app@sha256:${"d".repeat(64)}`,
					"linux/amd64",
				],
				{
					cwd: repositoryRoot,
					env: { ...process.env, PATH: `${fixture}:${process.env.PATH}` },
					encoding: "utf8",
				},
			);
			expect(output).toBe(`${configDigest}\n`);
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it("finds only an open release pull request", () => {
		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-release-pr-"));
		const mockGh = path.join(fixture, "gh");
		try {
			writeFileSync(
				mockGh,
				`#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == *"--head changeset-release/main"* ]]
[[ "$*" == *"--state open"* ]]
printf '42\n'
`,
			);
			chmodSync(mockGh, 0o755);
			const output = execFileSync("bash", [script("find-open-release-pr.sh"), "changeset-release/main"], {
				cwd: repositoryRoot,
				env: { ...process.env, PATH: `${fixture}:${process.env.PATH}` },
				encoding: "utf8",
			});
			expect(output).toBe("42\n");
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it("allows reportable findings and blocks high or critical vulnerabilities", () => {
		const fixture = mkdtempSync(path.join(tmpdir(), "skopeo-trivy-report-"));
		const reportFile = path.join(fixture, "trivy.json");
		const writeReport = (severities: ReadonlyArray<string>) =>
			writeFileSync(
				reportFile,
				JSON.stringify({
					Results: [
						{
							Vulnerabilities: severities.map((Severity, index) => ({
								InstalledVersion: "1.0.0",
								PkgName: `package-${index}`,
								Severity,
								VulnerabilityID: `CVE-TEST-${index}`,
							})),
						},
					],
				}),
			);
		try {
			writeReport(["LOW", "MEDIUM"]);
			expect(() => run("enforce-trivy-report.sh", [reportFile])).not.toThrow();
			writeReport(["HIGH"]);
			expect(() => run("enforce-trivy-report.sh", [reportFile])).toThrow();
			writeReport(["CRITICAL"]);
			expect(() => run("enforce-trivy-report.sh", [reportFile])).toThrow();
		} finally {
			rmSync(fixture, { force: true, recursive: true });
		}
	});
});

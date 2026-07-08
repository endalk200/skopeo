/**
 * Marketing content for the Skopeo landing page.
 *
 * Copy intentionally follows the domain language in CONTEXT.md
 * (Code Review Agent, Review Finding, Review Profile, Model Provider, ...).
 * Landing sections import from here so messaging stays in one place while
 * the presentation lives in the section components.
 */
import type { IconName } from "@/components/ui";

export type Feature = {
	title: string;
	description: string;
	icon: IconName;
};

export const features: Feature[] = [
	{
		title: "Runs locally from the CLI",
		description:
			"A fully functional code review agent in your terminal. Review uncommitted changes, a branch, or a pull request without leaving your shell.",
		icon: "terminal",
	},
	{
		title: "Bring your own provider",
		description:
			"Reach any model through OpenAI, Anthropic, OpenRouter, or a custom AI gateway. Even wire up your GitHub Copilot or Codex subscription.",
		icon: "plug",
	},
	{
		title: "Custom checks, in your repo",
		description:
			"Drop a .skopeo folder into your codebase to add project-specific checks and instructions that run as part of every review.",
		icon: "puzzle",
	},
	{
		title: "GitHub & GitLab, hosted",
		description:
			"Connect any GitHub or GitLab repository to the platform and get automatic reviews on every pull and merge request.",
		icon: "git",
	},
	{
		title: "Lint & static analysis",
		description:
			"The platform-powered agent runs linting and static analysis checks alongside the review, feeding real signals into every finding.",
		icon: "scan",
	},
	{
		title: "Security & code audits",
		description:
			"Go beyond pull-request review with dedicated security audits and vulnerability scans across your whole codebase.",
		icon: "shield",
	},
];

export type Finding = {
	label: string;
	severity: "high" | "medium" | "low";
	file: string;
	line: number;
	body: string;
};

/** Sample Review Findings used to render a mock Review Report. */
export const sampleFindings: Finding[] = [
	{
		label: "Security",
		severity: "high",
		file: "api/auth/session.ts",
		line: 42,
		body: "Session token is compared with a non-constant-time equality. Use a timing-safe comparison to prevent token guessing.",
	},
	{
		label: "Correctness",
		severity: "medium",
		file: "lib/pagination.ts",
		line: 88,
		body: "Off-by-one on the final page — the last item is dropped when total % pageSize === 0.",
	},
	{
		label: "Performance",
		severity: "low",
		file: "workers/index.ts",
		line: 17,
		body: "Regex is recompiled inside the hot loop. Hoist it to module scope to avoid repeated allocation.",
	},
];

export type Provider = { name: string; note: string };

export const providers: Provider[] = [
	{ name: "OpenAI", note: "GPT models via the official API" },
	{ name: "Anthropic", note: "Claude models, native tool use" },
	{ name: "OpenRouter", note: "One key, hundreds of models" },
	{ name: "Custom gateway", note: "Point at any OpenAI-compatible URL" },
	{ name: "GitHub Copilot", note: "Reuse your existing subscription" },
	{ name: "Codex", note: "Bring your Codex access" },
];

export type Step = { n: string; title: string; body: string };

export const steps: Step[] = [
	{
		n: "01",
		title: "Point Skopeo at a change",
		body: "Pick a Review Target — local edits, a branch, or a pull request. Skopeo scopes the review to your repository root.",
	},
	{
		n: "02",
		title: "Choose a Review Profile",
		body: "A profile pairs a model with a Review Depth — quick, standard, or thorough — plus prompts tuned to that model.",
	},
	{
		n: "03",
		title: "The agent investigates",
		body: "Skopeo invokes repository-scoped tools to read code, trace context, and run linting, static analysis, and vulnerability scans.",
	},
	{
		n: "04",
		title: "Read the Review Report",
		body: "Get a clear report of Review Findings, each with a category and severity — inline in your PR or right in the terminal.",
	},
];

export type Stat = { value: string; label: string };

export const stats: Stat[] = [
	{ value: "100%", label: "Open source" },
	{ value: "Self-host", label: "Your infra, your keys" },
	{ value: "6+", label: "Model providers" },
	{ value: "GH + GL", label: "GitHub & GitLab" },
];

/** Anchor links for the landing-page navigation. */
export const navLinks = [
	{ label: "Readout", href: "#specs" },
	{ label: "Notes", href: "#checks" },
	{ label: "Inputs", href: "#providers" },
];

/** The .skopeo folder preview rendered in the Custom Checks section. */
export const skopeoTree = [
	".skopeo/",
	"├─ checks/",
	"│  ├─ no-console.md",
	"│  ├─ api-contracts.md",
	"│  └─ threat-model.md",
	"├─ instructions.md",
	"└─ config.toml",
];

/** Bullet points listed alongside the .skopeo tree. */
export const customCheckPoints = [
	"Markdown checks committed alongside your code",
	"Wire in linting, static analysis & vulnerability scans",
	"Repository-scoped Agent Tools the reviewer can invoke",
	"Swap the whole prompt/model bundle via Review Profiles",
];

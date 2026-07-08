/**
 * Site identity and canonical external links.
 *
 * This is the single source of truth for the Skopeo brand as it appears
 * on the web — used by SEO metadata, structured data, the PWA manifest,
 * robots/sitemap, and marketing copy. It intentionally holds no
 * page-specific content so it can be shared by the marketing site and,
 * later, the platform.
 */
export const site = {
	name: "Skopeo",
	tagline: "Open-source, self-hostable code review agent",
	description:
		"Skopeo is an open-source, self-hostable code review agent. Run reviews locally from the CLI or connect any GitHub or GitLab repository. Bring your own model provider, add custom checks, and run security and code audits — all fully hackable.",
	url: "https://skopeo.dev",
	github: "https://github.com/endalk200/skopeo",
	docs: "https://skopeo.dev/docs",
	ogImage: "/og.png",
} as const;

export type Site = typeof site;

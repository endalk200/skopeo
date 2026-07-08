import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { site } from "@/config/site";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

const jetbrains = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-jetbrains",
	display: "swap",
});

const space = Space_Grotesk({
	subsets: ["latin"],
	variable: "--font-space",
	display: "swap",
});

export const metadata: Metadata = {
	metadataBase: new URL(site.url),
	title: {
		default: `${site.name} — ${site.tagline}`,
		template: `%s · ${site.name}`,
	},
	description: site.description,
	keywords: [
		"code review",
		"AI code review",
		"code review agent",
		"open source",
		"self-hosted",
		"CLI",
		"GitHub",
		"GitLab",
		"security audit",
		"static analysis",
		"Skopeo",
	],
	authors: [{ name: "Skopeo" }],
	creator: "Skopeo",
	openGraph: {
		type: "website",
		url: site.url,
		title: `${site.name} — ${site.tagline}`,
		description: site.description,
		siteName: site.name,
		images: [{ url: site.ogImage }],
	},
	twitter: {
		card: "summary_large_image",
		title: `${site.name} — ${site.tagline}`,
		description: site.description,
		images: [site.ogImage],
	},
	robots: { index: true, follow: true },
	alternates: { canonical: "/" },
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "#05060a" },
		{ media: "(prefers-color-scheme: light)", color: "#fafaf9" },
	],
	width: "device-width",
	initialScale: 1,
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			className={`${inter.variable} ${jetbrains.variable} ${space.variable}`}
		>
			<body className="antialiased">{children}</body>
		</html>
	);
}

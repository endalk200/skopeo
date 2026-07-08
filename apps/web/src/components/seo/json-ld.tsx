import { site } from "@/config/site";

/**
 * SoftwareApplication structured data (JSON-LD) for richer search results.
 * Rendered once per page in the document head.
 */
export function JsonLd() {
	const data = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: site.name,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "macOS, Linux, Windows",
		description: site.description,
		url: site.url,
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		license: "https://opensource.org/licenses/MIT",
		codeRepository: site.github,
	};

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
		/>
	);
}

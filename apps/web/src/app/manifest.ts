import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: site.name,
		short_name: site.name,
		description: site.description,
		start_url: "/",
		display: "standalone",
		background_color: "#05060a",
		theme_color: "#05060a",
		icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
	};
}

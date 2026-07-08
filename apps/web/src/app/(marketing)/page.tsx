import type { Metadata } from "next";
import { JsonLd } from "@/components/seo";
import { Landing } from "@/features/marketing";

export const metadata: Metadata = {
	title: { absolute: "Skopeo — A code review agent you can wire open" },
	description:
		"Every prompt, tool and check exposed. Add a .skopeo folder with custom checks, run linting, static analysis and vulnerability scans, and self-host it all.",
	alternates: { canonical: "/" },
};

export default function Page() {
	return (
		<>
			<JsonLd />
			<Landing />
		</>
	);
}

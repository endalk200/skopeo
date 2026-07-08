import { CarbonPage } from "@/components/ui";
import { navLinks } from "../content";
import { CarbonFooter } from "./carbon-footer";
import { CarbonNav } from "./carbon-nav";
import {
	CTA,
	CustomChecks,
	Features,
	Hero,
	HowItWorks,
	Providers,
	Security,
	Specs,
} from "./sections";

/**
 * The Skopeo landing page: an amber-phosphor engineering notebook that
 * leads with hackability — an oscilloscope hero, a specs readout, and the
 * .skopeo tree. Each section is a self-contained component; this file only
 * composes their order.
 */
export function Landing() {
	return (
		<CarbonPage>
			<CarbonNav links={navLinks} cta="Power on" />
			<Hero />
			<Specs />
			<CustomChecks />
			<Features />
			<HowItWorks />
			<Providers />
			<Security />
			<CTA />
			<CarbonFooter tag="SKOPEO · LOG 0.1" />
		</CarbonPage>
	);
}

import { Cell } from "@/components/ui";
import { stats } from "../../content";

/** Specs readout — the stat strip beneath the hero. */
export function Specs() {
	return (
		<section id="specs" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-8">
			<Cell className="grid grid-cols-2 divide-amber-400/15 sm:grid-cols-4 sm:divide-x">
				{stats.map((s) => (
					<div key={s.label} className="p-6">
						<div className="text-2xl font-semibold text-amber-300">
							{s.value}
						</div>
						<div className="mt-1 text-[10px] uppercase tracking-widest text-amber-200/40">
							{s.label}
						</div>
					</div>
				))}
			</Cell>
		</section>
	);
}

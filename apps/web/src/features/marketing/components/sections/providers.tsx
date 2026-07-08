import { Icon, SectionLabel } from "@/components/ui";
import { providers } from "../../content";

export function Providers() {
	return (
		<section id="providers" className="mx-auto max-w-6xl px-6 py-24">
			<SectionLabel n="// 04 — inputs" title="Bring your own provider" />
			<div className="grid gap-px bg-amber-400/15 sm:grid-cols-2 lg:grid-cols-3">
				{providers.map((p) => (
					<div
						key={p.name}
						className="flex items-center gap-4 bg-[#0a0a0c] p-6"
					>
						<span className="flex h-9 w-9 items-center justify-center border border-amber-400/30 text-amber-300">
							<Icon name="plug" className="h-4 w-4" />
						</span>
						<div>
							<div className="font-sans font-semibold text-amber-50">
								{p.name}
							</div>
							<div className="text-xs text-amber-200/40">{p.note}</div>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

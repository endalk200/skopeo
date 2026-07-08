import { SectionLabel } from "@/components/ui";
import { sampleFindings } from "../../content";

export function Security() {
	return (
		<section className="mx-auto max-w-6xl px-6 py-24">
			<SectionLabel n="// 05 — diagnostics" title="Security & code audits" />
			<div className="space-y-px bg-amber-400/15">
				{sampleFindings.map((f) => (
					<div
						key={f.file}
						className="grid grid-cols-[auto_1fr] gap-4 bg-[#0a0a0c] p-6 sm:grid-cols-[8rem_1fr_auto] sm:items-center"
					>
						<span
							className={`text-xs uppercase tracking-widest ${
								f.severity === "high"
									? "text-orange-400"
									: f.severity === "medium"
										? "text-amber-300"
										: "text-yellow-200"
							}`}
						>
							● {f.severity}
						</span>
						<div>
							<span className="font-sans font-semibold text-amber-50">
								{f.label}
							</span>
							<p className="mt-1 font-sans text-sm text-amber-100/55">
								{f.body}
							</p>
						</div>
						<span className="text-xs text-amber-200/40">
							{f.file}:{f.line}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

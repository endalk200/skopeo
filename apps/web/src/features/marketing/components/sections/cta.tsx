import { Cell } from "@/components/ui";
import { site } from "@/config/site";

export function CTA() {
	return (
		<section className="mx-auto max-w-6xl px-6 py-24">
			<Cell className="bg-black/40 p-10 text-center sm:p-16">
				<span className="pointer-events-none absolute inset-0 text-amber-400/60 bg-dot-grid opacity-20" />
				<h2 className="relative font-sans text-3xl font-semibold tracking-tight text-amber-50 sm:text-4xl">
					Clone it. Read it. Bend it to your workflow.
				</h2>
				<p className="relative mx-auto mt-4 max-w-xl font-sans text-amber-100/60">
					Skopeo is engineered to be inspected and extended. Self-host the whole
					thing on your own infrastructure.
				</p>
				<div className="relative mt-8 inline-flex items-center gap-2 border border-amber-400/40 px-4 py-3 text-sm text-amber-200">
					<span className="text-amber-400">$</span> npm i -g @skopeo/cli
				</div>
				<div className="relative mt-8 flex flex-wrap justify-center gap-3">
					<a
						href={site.docs}
						className="bg-amber-400 px-6 py-3 text-sm font-semibold text-[#0a0a0c]"
					>
						Read the docs
					</a>
					<a
						href={site.github}
						className="border border-amber-400/40 px-6 py-3 text-sm font-medium text-amber-100 hover:bg-amber-400/10"
					>
						View source
					</a>
				</div>
			</Cell>
		</section>
	);
}

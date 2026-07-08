/** Section heading with a title and a monospace annotation on the right. */
export function SectionLabel({ n, title }: { n: string; title: string }) {
	return (
		<div className="mb-12 flex items-end justify-between border-b border-amber-400/20 pb-4">
			<h2 className="font-sans text-2xl font-semibold tracking-tight text-amber-50 sm:text-3xl">
				{title}
			</h2>
			<span className="text-xs uppercase tracking-widest text-amber-200/40">
				{n}
			</span>
		</div>
	);
}

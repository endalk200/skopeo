import type { ReactNode } from "react";

/**
 * Full-page Carbon shell: the near-black notebook drawn on dotted graph
 * paper with a soft amber-phosphor glow. This is the base medium for every
 * Carbon surface (marketing today, the platform later), so it lives in the
 * shared design system rather than any single feature.
 */
export function CarbonPage({
	children,
	overlay,
}: {
	children: ReactNode;
	/** Optional extra background layer rendered above the base paper. */
	overlay?: ReactNode;
}) {
	return (
		<div className="relative min-h-dvh bg-[#0a0a0c] font-mono text-amber-100/80 selection:bg-amber-400/30">
			<div className="pointer-events-none fixed inset-0 text-amber-400/70 bg-dot-grid opacity-[0.16]" />
			<div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(251,191,36,0.08),transparent_55%)]" />
			{overlay}
			<div className="relative">{children}</div>
		</div>
	);
}

import type { ReactNode } from "react";

/**
 * Bracketed corner box — the Carbon "notebook cell". Wraps content in a
 * thin amber frame with phosphor corner ticks.
 */
export function Cell({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={`relative border border-amber-400/25 ${className}`}>
			<span className="absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-amber-400/70" />
			<span className="absolute -right-px -top-px h-2.5 w-2.5 border-r border-t border-amber-400/70" />
			<span className="absolute -bottom-px -left-px h-2.5 w-2.5 border-b border-l border-amber-400/70" />
			<span className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-amber-400/70" />
			{children}
		</div>
	);
}

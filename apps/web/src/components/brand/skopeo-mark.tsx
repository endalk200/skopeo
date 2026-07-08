import type { SVGProps } from "react";

/**
 * Skopeo wordmark glyph — an aperture/scope motif that reads as
 * "reviewing" a change. Uses currentColor so any surface can tint it.
 */
export function SkopeoMark(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
			<circle
				cx="16"
				cy="16"
				r="13"
				stroke="currentColor"
				strokeWidth="2"
				opacity="0.35"
			/>
			<circle cx="16" cy="16" r="6.5" stroke="currentColor" strokeWidth="2" />
			<path
				d="M16 3v6.5M16 22.5V29M3 16h6.5M22.5 16H29"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<circle cx="16" cy="16" r="1.8" fill="currentColor" />
		</svg>
	);
}

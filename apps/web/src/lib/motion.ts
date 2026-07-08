"use client";

import type { Variants } from "motion/react";

/**
 * Reusable motion variants shared across landing-page designs.
 * Keeping them here means every design animates with a consistent
 * rhythm while remaining free to compose them differently.
 */

export const fadeUp: Variants = {
	hidden: { opacity: 0, y: 24 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
	},
};

export const fadeIn: Variants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { duration: 0.8, ease: "easeOut" } },
};

export const scaleIn: Variants = {
	hidden: { opacity: 0, scale: 0.94 },
	visible: {
		opacity: 1,
		scale: 1,
		transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
	},
};

/** Parent container that staggers its children into view. */
export function stagger(amount = 0.09, delayChildren = 0): Variants {
	return {
		hidden: {},
		visible: {
			transition: { staggerChildren: amount, delayChildren },
		},
	};
}

/** Sensible defaults for scroll-triggered reveals. */
export const viewportOnce = { once: true, amount: 0.3 } as const;

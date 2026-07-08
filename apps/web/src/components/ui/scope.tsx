"use client";

import { motion } from "motion/react";

/** Animated oscilloscope sweep — the Carbon "review signal" motif. */
export function Scope({ className = "h-32 w-full" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 260 120"
			className={`text-amber-400 ${className}`}
			fill="none"
			preserveAspectRatio="none"
		>
			<title>Oscilloscope trace of the review signal</title>
			{[30, 60, 90].map((y) => (
				<line
					key={y}
					x1="0"
					y1={y}
					x2="260"
					y2={y}
					stroke="currentColor"
					strokeWidth="0.4"
					opacity="0.2"
				/>
			))}
			<motion.path
				d="M0 60 Q20 20 40 60 T80 60 Q100 96 120 60 T160 60 Q180 28 200 60 T240 60 L260 60"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				initial={{ pathLength: 0, opacity: 0.4 }}
				animate={{ pathLength: 1, opacity: 1 }}
				transition={{
					duration: 2.4,
					repeat: Number.POSITIVE_INFINITY,
					repeatType: "reverse",
					ease: "easeInOut",
				}}
				style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.6))" }}
			/>
		</svg>
	);
}

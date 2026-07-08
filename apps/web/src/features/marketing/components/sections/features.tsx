"use client";

import { motion } from "motion/react";
import { Icon, SectionLabel } from "@/components/ui";
import { fadeUp, stagger, viewportOnce } from "@/lib/motion";
import { features } from "../../content";

export function Features() {
	return (
		<section className="mx-auto max-w-6xl px-6 py-24">
			<SectionLabel n="// 02 — components" title="Everything a review needs" />
			<motion.div
				initial="hidden"
				whileInView="visible"
				viewport={viewportOnce}
				variants={stagger(0.07)}
				className="grid gap-px bg-amber-400/15 sm:grid-cols-2 lg:grid-cols-3"
			>
				{features.map((f, i) => (
					<motion.div
						key={f.title}
						variants={fadeUp}
						className="group relative bg-[#0a0a0c] p-7 transition-colors hover:bg-[#12100a]"
					>
						<span className="absolute right-4 top-4 text-[10px] text-amber-200/25">
							R{String(i + 1).padStart(2, "0")}
						</span>
						<div className="flex h-10 w-10 items-center justify-center border border-amber-400/30 text-amber-300">
							<Icon name={f.icon} className="h-5 w-5" />
						</div>
						<h3 className="mt-5 font-sans text-lg font-semibold text-amber-50">
							{f.title}
						</h3>
						<p className="mt-2 font-sans text-sm leading-relaxed text-amber-100/55">
							{f.description}
						</p>
					</motion.div>
				))}
			</motion.div>
		</section>
	);
}

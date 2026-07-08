"use client";

import { motion } from "motion/react";
import { SectionLabel } from "@/components/ui";
import { viewportOnce } from "@/lib/motion";
import { steps } from "../../content";

export function HowItWorks() {
	return (
		<section className="mx-auto max-w-6xl px-6 py-24">
			<SectionLabel n="// 03 — sequence" title="From change to Review Report" />
			<div className="grid gap-px bg-amber-400/15 md:grid-cols-4">
				{steps.map((s) => (
					<motion.div
						key={s.n}
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={viewportOnce}
						transition={{ duration: 0.5 }}
						className="bg-[#0a0a0c] p-6"
					>
						<div className="text-sm text-amber-300">{s.n}</div>
						<h3 className="mt-3 font-sans font-semibold text-amber-50">
							{s.title}
						</h3>
						<p className="mt-2 font-sans text-sm text-amber-100/55">{s.body}</p>
					</motion.div>
				))}
			</div>
		</section>
	);
}

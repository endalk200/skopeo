"use client";

import { motion } from "motion/react";
import { Cell, Icon, SectionLabel } from "@/components/ui";
import { viewportOnce } from "@/lib/motion";
import { customCheckPoints, skopeoTree } from "../../content";

export function CustomChecks() {
	return (
		<section id="checks" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
			<SectionLabel n="// 01 — hackable" title="Custom checks, in your repo" />
			<div className="grid gap-8 lg:grid-cols-2 lg:items-center">
				<div className="space-y-5">
					<p className="font-sans text-lg leading-relaxed text-amber-100/70">
						The review is a program you can edit. Add project-specific checks
						and instructions in plain markdown and they run on every review — no
						plugin SDK, no lock-in.
					</p>
					<ul className="space-y-3 text-sm text-amber-100/70">
						{customCheckPoints.map((t) => (
							<li key={t} className="flex items-start gap-3">
								<Icon
									name="check"
									className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
								/>
								<span className="font-sans">{t}</span>
							</li>
						))}
					</ul>
				</div>
				<Cell className="bg-black/50 p-6 text-sm">
					<div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-amber-200/40">
						<span>your-repo/.skopeo</span>
						<span>tree</span>
					</div>
					{skopeoTree.map((t, i) => (
						<motion.div
							key={t}
							initial={{ opacity: 0, x: -8 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={viewportOnce}
							transition={{ duration: 0.3, delay: i * 0.04 }}
							className={i === 0 ? "text-amber-300" : "text-amber-100/55"}
						>
							{t}
						</motion.div>
					))}
				</Cell>
			</div>
		</section>
	);
}

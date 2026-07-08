"use client";

import { motion } from "motion/react";
import { Cell, Scope } from "@/components/ui";
import { site } from "@/config/site";
import { fadeUp, stagger } from "@/lib/motion";

export function Hero() {
	return (
		<section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
			<div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
				<motion.div initial="hidden" animate="visible" variants={stagger(0.08)}>
					<motion.div
						variants={fadeUp}
						className="mb-6 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300"
					>
						<span className="h-2 w-2 animate-blink bg-amber-400" />
						log · rev 0.1 · MIT · self-hostable
					</motion.div>
					<motion.h1
						variants={fadeUp}
						className="text-4xl font-semibold leading-[1.06] tracking-tight text-amber-50 sm:text-6xl"
					>
						A code review agent you can wire open
					</motion.h1>
					<motion.p
						variants={fadeUp}
						className="mt-6 max-w-lg leading-relaxed text-amber-100/60"
					>
						Every prompt, tool and check is exposed on the bench. Drop a{" "}
						<code className="text-amber-300">.skopeo</code> folder in your repo
						and extend the review with your own rules, linting, static analysis
						and vulnerability scans.
					</motion.p>
					<motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
						<a
							href={site.docs}
							className="group inline-flex items-center gap-2 bg-amber-400 px-6 py-3 text-sm font-semibold text-[#0a0a0c] transition-transform hover:-translate-y-0.5"
						>
							Read the log
							<span className="transition-transform group-hover:translate-x-0.5">
								→
							</span>
						</a>
						<a
							href={site.github}
							className="inline-flex items-center gap-2 border border-amber-400/40 px-6 py-3 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-400/10"
						>
							Source
						</a>
					</motion.div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, scale: 0.96 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
				>
					<Cell className="bg-black/50 p-5">
						<div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-amber-200/40">
							<span>ch.1 — review signal</span>
							<span>200 mV / div</span>
						</div>
						<Scope />
						<div className="mt-4 grid grid-cols-3 gap-2 border-t border-amber-400/20 pt-4 text-[10px] uppercase tracking-widest text-amber-200/50">
							<span>&gt; read code</span>
							<span>&gt; run checks</span>
							<span>&gt; report</span>
						</div>
					</Cell>
				</motion.div>
			</div>
		</section>
	);
}

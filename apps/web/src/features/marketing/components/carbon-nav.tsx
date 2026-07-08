"use client";

import Link from "next/link";
import { useState } from "react";
import { SkopeoMark } from "@/components/brand";
import { site } from "@/config/site";

/** Sticky top nav for the landing page. */
export function CarbonNav({
	links,
	cta = "Power on",
}: {
	links: { label: string; href: string }[];
	cta?: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<header className="sticky top-0 z-40 border-b border-amber-400/20 bg-[#0a0a0c]/85 backdrop-blur-md">
			<div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
				<Link href="/" className="flex items-center gap-2.5">
					<SkopeoMark className="h-6 w-6 text-amber-400" />
					<span className="text-sm font-semibold tracking-[0.3em] text-amber-100">
						SKOPEO
					</span>
				</Link>
				<nav className="hidden items-center gap-7 text-xs uppercase tracking-widest text-amber-200/60 md:flex">
					{links.map((l) => (
						<a
							key={l.href}
							className="transition-colors hover:text-amber-300"
							href={l.href}
						>
							{l.label}
						</a>
					))}
				</nav>
				<div className="flex items-center gap-3">
					<a
						href={site.docs}
						className="border border-amber-400/40 px-4 py-2 text-xs uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-400/10"
					>
						{cta}
					</a>
					<button
						type="button"
						className="border border-amber-400/30 px-3 py-2 text-xs uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-400/10 md:hidden"
						aria-controls="mobile-nav"
						aria-expanded={open}
						onClick={() => setOpen((current) => !current)}
					>
						Menu
					</button>
				</div>
			</div>
			{open ? (
				<nav
					id="mobile-nav"
					className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pb-5 text-xs uppercase tracking-widest text-amber-200/70 md:hidden"
				>
					{links.map((l) => (
						<a
							key={l.href}
							className="transition-colors hover:text-amber-300"
							href={l.href}
							onClick={() => setOpen(false)}
						>
							{l.label}
						</a>
					))}
				</nav>
			) : null}
		</header>
	);
}

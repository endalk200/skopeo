import { SkopeoMark } from "@/components/brand";
import { site } from "@/config/site";

/** Landing-page footer; `tag` prints in the corner block. */
export function CarbonFooter({ tag }: { tag: string }) {
	return (
		<footer className="border-t border-amber-400/20 pb-24">
			<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs uppercase tracking-widest text-amber-200/40 sm:flex-row">
				<div className="flex items-center gap-2">
					<SkopeoMark className="h-5 w-5 text-amber-400" />
					<span>{tag}</span>
				</div>
				<div className="flex gap-6">
					<a href={site.github} className="hover:text-amber-300">
						GitHub
					</a>
					<a href={site.docs} className="hover:text-amber-300">
						Docs
					</a>
					<span>MIT © {new Date().getFullYear()}</span>
				</div>
			</div>
		</footer>
	);
}

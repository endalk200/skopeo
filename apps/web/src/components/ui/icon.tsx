import type { SVGProps } from "react";

/**
 * Lightweight inline icon set (stroke-based, currentColor). Avoids an
 * icon-library dependency and keeps the bundle small. `IconName` is the
 * canonical list of available glyphs and is shared by any content that
 * needs to reference an icon by name.
 */
export type IconName =
	| "terminal"
	| "shield"
	| "plug"
	| "git"
	| "check"
	| "scan"
	| "gauge"
	| "puzzle"
	| "lock"
	| "bolt"
	| "eye"
	| "layers";

const paths: Record<IconName, React.ReactNode> = {
	terminal: (
		<>
			<path d="m4 17 6-5-6-5" />
			<path d="M12 19h8" />
		</>
	),
	shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
	plug: (
		<>
			<path d="M9 2v6" />
			<path d="M15 2v6" />
			<path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
			<path d="M12 17v5" />
		</>
	),
	git: (
		<>
			<circle cx="6" cy="6" r="3" />
			<circle cx="6" cy="18" r="3" />
			<circle cx="18" cy="9" r="3" />
			<path d="M18 12a9 9 0 0 1-9 9" />
			<path d="M6 9v6" />
		</>
	),
	check: <path d="m5 13 4 4L19 7" />,
	scan: (
		<>
			<path d="M3 7V5a2 2 0 0 1 2-2h2" />
			<path d="M17 3h2a2 2 0 0 1 2 2v2" />
			<path d="M21 17v2a2 2 0 0 1-2 2h-2" />
			<path d="M7 21H5a2 2 0 0 1-2-2v-2" />
			<path d="M7 12h10" />
		</>
	),
	gauge: (
		<>
			<path d="m12 14 4-4" />
			<path d="M3.34 19a10 10 0 1 1 17.32 0" />
		</>
	),
	puzzle: (
		<path d="M15.5 3.5a2 2 0 0 0-3 0l-.5.6-.5-.6a2 2 0 1 0-3 2.6l.6.5-.6.5a2 2 0 1 0 2.6 3l.5-.6.5.6a2 2 0 1 0 3-2.6l-.6-.5.6-.5a2 2 0 0 0 0-3ZM7 13H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2" />
	),
	lock: (
		<>
			<rect x="4" y="10" width="16" height="10" rx="2" />
			<path d="M8 10V7a4 4 0 0 1 8 0v3" />
		</>
	),
	bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
	eye: (
		<>
			<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
		</>
	),
	layers: (
		<>
			<path d="m12 2 9 5-9 5-9-5 9-5Z" />
			<path d="m3 12 9 5 9-5" />
			<path d="m3 17 9 5 9-5" />
		</>
	),
};

export function Icon({
	name,
	...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.6}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			{paths[name]}
		</svg>
	);
}

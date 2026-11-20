import type { SessionStatus } from "agent/types";

export const LEVEL_LABELS = {
	junior: "Junior",
	mid: "Mid-level",
	senior: "Senior",
	staff: "Staff+",
} as const;

export function scoreTone(score: number) {
	if (score >= 8) return "text-emerald-600 dark:text-emerald-400";
	if (score >= 6) return "text-amber-600 dark:text-amber-400";
	return "text-rose-600 dark:text-rose-400";
}

export function ScorePill({ score }: { score: number }) {
	const tone =
		score >= 8
			? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
			: score >= 6
				? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
				: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900";
	return (
		<span
			className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ${tone}`}
		>
			{score.toFixed(score % 1 === 0 ? 0 : 1)}/10
		</span>
	);
}

export function StatusPill({ status }: { status: SessionStatus }) {
	const styles: Record<SessionStatus, string> = {
		active:
			"bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
		grading:
			"bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
		graded:
			"bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
		failed:
			"bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
	};
	const labels: Record<SessionStatus, string> = {
		active: "In progress",
		grading: "Grading",
		graded: "Graded",
		failed: "Grading failed",
	};
	return (
		<span
			className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${styles[status]}`}
		>
			{labels[status]}
		</span>
	);
}

export function formatDate(ms: number) {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(ms);
}

export function Spinner({ className = "size-4" }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={`animate-spin ${className}`}
			fill="none"
			viewBox="0 0 24 24"
		>
			<circle
				className="opacity-20"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="3"
			/>
			<path
				d="M22 12a10 10 0 0 0-10-10"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="3"
			/>
		</svg>
	);
}

export function ErrorNote({ message }: { message: string }) {
	return (
		<p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
			{message}
		</p>
	);
}

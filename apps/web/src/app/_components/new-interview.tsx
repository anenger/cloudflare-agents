"use client";

import type { Level, SessionSummary } from "agent/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useOverview } from "~/app/_components/sidebar";
import { ErrorNote, LEVEL_LABELS, Spinner } from "~/app/_components/ui";
import { api } from "~/trpc/react";

const FOCUS_SUGGESTIONS = [
	"Behavioral",
	"System design",
	"Technical deep dive",
	"Leadership",
	"Debugging & incidents",
];

export function NewInterview() {
	const router = useRouter();
	const utils = api.useUtils();
	const overview = useOverview();
	const profile = overview.data?.profile;

	const [role, setRole] = useState("");
	const [level, setLevel] = useState<Level>("mid");
	const [focus, setFocus] = useState<string[]>([]);

	// Fill the form from the saved profile once, when it first loads (not on
	// every refetch, which would overwrite what the user picked).
	const prefilled = useRef(false);
	useEffect(() => {
		if (!profile || prefilled.current) return;
		prefilled.current = true;
		setRole((r) => r || profile.targetRole);
		setLevel(profile.level);
	}, [profile]);

	const start = api.coach.startSession.useMutation({
		onSuccess: async (session) => {
			await utils.coach.overview.invalidate();
			router.push(`/sessions/${session.id}`);
		},
	});

	const toggleFocus = (f: string) =>
		setFocus((cur) =>
			cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f],
		);

	const active = overview.data?.sessions.find((s) => s.status === "active");
	const graded = (overview.data?.sessions ?? []).filter(
		(s) => s.status === "graded" && s.score,
	);

	return (
		<div className="space-y-6">
			<section className="card overflow-hidden">
				<div className="from-accent-50 dark:from-accent-700/15 border-b border-zinc-200 bg-gradient-to-br to-white p-6 dark:border-zinc-800 dark:to-zinc-900">
					<h1 className="text-2xl font-semibold tracking-tight">
						Practice a mock interview
					</h1>
					<p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
						Your AI interviewer asks one question at a time. When you finish, a
						background workflow grades every answer and updates what your coach
						remembers about you, so the next session targets your weak spots.
					</p>
				</div>

				<form
					className="grid gap-4 p-6 sm:grid-cols-2"
					onSubmit={(e) => {
						e.preventDefault();
						start.mutate({
							role: role.trim() || undefined,
							level,
							focus: focus.join(", "),
						});
					}}
				>
					<div>
						<label className="label" htmlFor="role">
							Role
						</label>
						<input
							className="input"
							id="role"
							onChange={(e) => setRole(e.target.value)}
							placeholder="e.g. Backend Engineer"
							required
							value={role}
						/>
					</div>
					<div>
						<label className="label" htmlFor="level-select">
							Level
						</label>
						<select
							className="input"
							id="level-select"
							onChange={(e) => setLevel(e.target.value as Level)}
							value={level}
						>
							{Object.entries(LEVEL_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>
					<fieldset className="sm:col-span-2">
						<legend className="label">Focus (optional)</legend>
						<div className="flex flex-wrap gap-2">
							{FOCUS_SUGGESTIONS.map((f) => {
								const on = focus.includes(f);
								return (
									<button
										aria-pressed={on}
										className={`rounded-full border px-3 py-1 text-sm transition ${
											on
												? "border-accent-600 bg-accent-600 text-white"
												: "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
										}`}
										key={f}
										onClick={() => toggleFocus(f)}
										type="button"
									>
										{f}
									</button>
								);
							})}
						</div>
					</fieldset>
					{start.error && (
						<div className="sm:col-span-2">
							<ErrorNote message={start.error.message} />
						</div>
					)}
					<div className="flex flex-wrap items-center gap-3 sm:col-span-2">
						<button
							className="btn-primary"
							disabled={start.isPending || !role.trim()}
							type="submit"
						>
							{start.isPending && <Spinner />}
							Start interview
						</button>
						{active && (
							<button
								className="btn-secondary"
								onClick={() => router.push(`/sessions/${active.id}`)}
								type="button"
							>
								Resume {active.role} interview
							</button>
						)}
					</div>
				</form>
			</section>

			{graded.length > 0 && <ProgressCard sessions={graded} />}

			<HowItWorks />
		</div>
	);
}

function ProgressCard({ sessions }: { sessions: SessionSummary[] }) {
	// Oldest first, last 12 sessions.
	const points = [...sessions].reverse().slice(-12);
	const scores = points.map((s) => s.score ?? 0);
	const latest = scores.at(-1) ?? 0;
	const first = scores[0] ?? 0;
	const delta = Math.round((latest - first) * 10) / 10;

	const w = 320;
	const h = 72;
	const x = (i: number) =>
		points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 12) + 6;
	const y = (score: number) => h - 6 - ((score - 1) / 9) * (h - 12);
	const path = scores
		.map((s, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(s)}`)
		.join(" ");

	return (
		<section className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
			<div className="shrink-0">
				<h2 className="label">Your progress</h2>
				<p className="text-3xl font-semibold tabular-nums">
					{latest.toFixed(1)}
					<span className="text-base text-zinc-400">/10</span>
				</p>
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					{points.length} graded session{points.length === 1 ? "" : "s"}
					{points.length > 1 && (
						<span className={delta >= 0 ? "text-emerald-600" : "text-rose-600"}>
							{" "}
							· {delta >= 0 ? "+" : ""}
							{delta} since first
						</span>
					)}
				</p>
			</div>
			{points.length > 1 && (
				<svg
					aria-label={`Score trend: ${scores.join(", ")}`}
					className="text-accent-600 h-20 w-full min-w-0"
					preserveAspectRatio="none"
					role="img"
					viewBox={`0 0 ${w} ${h}`}
				>
					<line
						className="text-zinc-200 dark:text-zinc-800"
						stroke="currentColor"
						strokeDasharray="4 4"
						x1="0"
						x2={w}
						y1={y(7)}
						y2={y(7)}
					/>
					<path
						d={path}
						fill="none"
						stroke="currentColor"
						strokeLinejoin="round"
						strokeWidth="2.5"
						vectorEffect="non-scaling-stroke"
					/>
					{/* Zero-length round-capped strokes stay circular when the SVG stretches. */}
					{scores.map((s, i) => (
						<path
							d={`M${x(i)},${y(s)}h0`}
							key={points[i]?.id}
							stroke="currentColor"
							strokeLinecap="round"
							strokeWidth="8"
							vectorEffect="non-scaling-stroke"
						/>
					))}
				</svg>
			)}
		</section>
	);
}

function HowItWorks() {
	const steps = [
		{
			title: "Chat",
			body: "Next.js (T3) on Workers streams your answers to an Agents SDK Durable Object that runs Llama 3.3 on Workers AI.",
		},
		{
			title: "Grade",
			body: "Ending a session starts a Cloudflare Workflow that grades each answer in its own retryable step.",
		},
		{
			title: "Remember",
			body: "The agent stores sessions in its own SQLite database and keeps memory notes that shape your next interview.",
		},
	];
	return (
		<section className="grid gap-3 sm:grid-cols-3">
			{steps.map((s, i) => (
				<div className="card p-4" key={s.title}>
					<p className="text-accent-700 dark:text-accent-500 text-xs font-medium">
						Step {i + 1}
					</p>
					<h3 className="mt-1 font-semibold">{s.title}</h3>
					<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
						{s.body}
					</p>
				</div>
			))}
		</section>
	);
}

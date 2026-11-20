"use client";

import type { Message, SessionReport, SessionSummary } from "agent/types";
import { useRouter } from "next/navigation";

import { Bubble } from "~/app/_components/interview-chat";
import { ErrorNote, ScorePill, Spinner, scoreTone } from "~/app/_components/ui";
import { api } from "~/trpc/react";

export function Report({
	session,
	report,
	messages,
}: {
	session: SessionSummary;
	report: SessionReport;
	messages: Message[];
}) {
	const router = useRouter();
	const utils = api.useUtils();
	const again = api.coach.startSession.useMutation({
		onSuccess: async (next) => {
			await utils.coach.overview.invalidate();
			router.push(`/sessions/${next.id}`);
		},
	});

	const hasAnswers = report.questions.length > 0;

	return (
		<div className="space-y-4">
			<section className="card grid gap-6 p-6 sm:grid-cols-[auto_minmax(0,1fr)]">
				<div className="text-center sm:pr-6 sm:text-left">
					<p className="label">Overall</p>
					<p
						className={`text-5xl font-semibold tabular-nums ${hasAnswers ? scoreTone(report.overallScore) : "text-zinc-400"}`}
					>
						{hasAnswers ? report.overallScore.toFixed(1) : "–"}
						<span className="text-lg text-zinc-400">/10</span>
					</p>
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						{report.questions.length} answer
						{report.questions.length === 1 ? "" : "s"} graded
					</p>
				</div>
				<div className="min-w-0 space-y-4">
					<p className="leading-relaxed">{report.summary}</p>
					<div className="grid gap-4 sm:grid-cols-2">
						<Bullets
							items={report.strengths}
							title="What went well"
							tone="good"
						/>
						<Bullets
							items={report.improvements}
							title="Work on next"
							tone="work"
						/>
					</div>
				</div>
			</section>

			{report.questions.map((q, i) => (
				<details className="card group p-0" key={q.question} open={i === 0}>
					<summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
						<div className="min-w-0">
							<p className="label">Question {i + 1}</p>
							<p className="font-medium">{q.question}</p>
						</div>
						<ScorePill score={q.score} />
					</summary>
					<div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
						<div>
							<p className="label">Your answer</p>
							<p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
								{q.answer}
							</p>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<Bullets items={q.strengths} title="Strengths" tone="good" />
							<Bullets items={q.improvements} title="Improve" tone="work" />
						</div>
						{q.exampleAnswer && (
							<div className="bg-accent-50 dark:bg-accent-700/15 rounded-xl p-4">
								<p className="label text-accent-700 dark:text-accent-500">
									A stronger answer
								</p>
								<p className="text-sm leading-relaxed whitespace-pre-wrap">
									{q.exampleAnswer}
								</p>
							</div>
						)}
					</div>
				</details>
			))}

			<div className="flex flex-wrap items-center gap-3">
				<button
					className="btn-primary"
					disabled={again.isPending}
					onClick={() =>
						again.mutate({
							role: session.role,
							level: session.level,
							focus: session.focus,
						})
					}
					type="button"
				>
					{again.isPending && <Spinner />}
					Practise again (new questions)
				</button>
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					Your coach will remember this session and target your weak spots.
				</p>
			</div>
			{again.error && <ErrorNote message={again.error.message} />}

			<Transcript messages={messages} />
		</div>
	);
}

function Bullets({
	title,
	items,
	tone,
}: {
	title: string;
	items: string[];
	tone: "good" | "work";
}) {
	if (items.length === 0) return null;
	return (
		<div>
			<p className="label">{title}</p>
			<ul className="space-y-1.5">
				{items.map((item) => (
					<li className="flex gap-2 text-sm" key={item}>
						<span
							aria-hidden="true"
							className={`mt-0.5 shrink-0 font-bold ${tone === "good" ? "text-emerald-600" : "text-amber-600"}`}
						>
							{tone === "good" ? "✓" : "→"}
						</span>
						<span>{item}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function Transcript({ messages }: { messages: Message[] }) {
	if (messages.length === 0) return null;
	return (
		<details className="card p-0">
			<summary className="cursor-pointer p-4 text-sm font-medium">
				Full transcript ({messages.length} messages)
			</summary>
			<div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
				{messages.map((m) => (
					<Bubble key={m.id} role={m.role}>
						{m.content}
					</Bubble>
				))}
			</div>
		</details>
	);
}

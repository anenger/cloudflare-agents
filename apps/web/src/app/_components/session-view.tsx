"use client";

import { useRouter } from "next/navigation";

import { InterviewChat } from "~/app/_components/interview-chat";
import { Report, Transcript } from "~/app/_components/report";
import { useOverview } from "~/app/_components/sidebar";
import {
	ErrorNote,
	LEVEL_LABELS,
	Spinner,
	StatusPill,
} from "~/app/_components/ui";
import { api } from "~/trpc/react";

export function SessionView({ id }: { id: string }) {
	const router = useRouter();
	const utils = api.useUtils();
	const query = api.coach.session.useQuery(
		{ id },
		{
			refetchInterval: (q) =>
				q.state.data?.session.status === "grading" ? 2000 : false,
			retry: (count, err) => err.data?.code !== "NOT_FOUND" && count < 2,
		},
	);

	const remove = api.coach.deleteSession.useMutation({
		onSuccess: async () => {
			await utils.coach.overview.invalidate();
			router.push("/");
		},
	});

	if (query.error) {
		return (
			<div className="card space-y-3 p-6">
				<ErrorNote
					message={
						query.error.data?.code === "NOT_FOUND"
							? "This interview doesn't exist (or was deleted)."
							: query.error.message
					}
				/>
			</div>
		);
	}

	if (!query.data) {
		return (
			<div className="card grid h-64 place-items-center text-zinc-500">
				<Spinner className="size-6" />
			</div>
		);
	}

	const { session, messages, report } = query.data;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-xl font-semibold tracking-tight">
							{session.role}
						</h1>
						<StatusPill status={session.status} />
					</div>
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						{LEVEL_LABELS[session.level]}
						{session.focus ? ` · ${session.focus}` : ""}
					</p>
				</div>
				{session.status !== "grading" && (
					<button
						className="text-sm text-zinc-500 hover:text-rose-600 hover:underline"
						disabled={remove.isPending}
						onClick={() => {
							if (confirm("Delete this interview and its transcript?"))
								remove.mutate({ id });
						}}
						type="button"
					>
						Delete
					</button>
				)}
			</div>

			{session.status === "active" && (
				<InterviewChat detail={query.data} key={session.id} />
			)}

			{session.status === "grading" && (
				<>
					<GradingProgress sessionId={session.id} />
					<Transcript messages={messages} />
				</>
			)}

			{session.status === "failed" && <GradingFailed sessionId={session.id} />}

			{session.status === "graded" && report && (
				<Report messages={messages} report={report} session={session} />
			)}
		</div>
	);
}

function GradingProgress({ sessionId }: { sessionId: string }) {
	const overview = useOverview();
	const grading = overview.data?.grading;
	const mine = grading?.sessionId === sessionId ? grading : null;

	const label = !mine
		? "Starting the grading workflow…"
		: mine.stage === "grading"
			? mine.total
				? `Grading answer ${Math.min(mine.done + 1, mine.total)} of ${mine.total}…`
				: "Reading your transcript…"
			: mine.stage === "summarizing"
				? "Writing your debrief and updating your coach's memory…"
				: "Saving your report…";

	const pct = !mine?.total
		? 5
		: mine.stage === "grading"
			? 10 + (mine.done / mine.total) * 70
			: mine.stage === "summarizing"
				? 88
				: 96;

	return (
		<div className="card p-6">
			<div className="flex items-center gap-3">
				<Spinner className="text-accent-600 size-5" />
				<p className="font-medium" role="status">
					{label}
				</p>
			</div>
			<div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
				<div
					className="bg-accent-600 h-full rounded-full transition-all duration-700"
					style={{ width: `${pct}%` }}
				/>
			</div>
			<p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
				A Cloudflare Workflow grades each answer in its own durable, retryable
				step. You can leave this page; the report will be here when you come
				back.
			</p>
		</div>
	);
}

function GradingFailed({ sessionId }: { sessionId: string }) {
	const utils = api.useUtils();
	const retry = api.coach.endSession.useMutation({
		onSuccess: () =>
			Promise.all([
				utils.coach.session.invalidate({ id: sessionId }),
				utils.coach.overview.invalidate(),
			]),
	});
	return (
		<div className="card space-y-3 p-6">
			<ErrorNote message="Grading failed after several retries. Your transcript is safe." />
			{retry.error && <ErrorNote message={retry.error.message} />}
			<button
				className="btn-primary"
				disabled={retry.isPending}
				onClick={() => retry.mutate({ id: sessionId })}
				type="button"
			>
				Retry grading
			</button>
		</div>
	);
}

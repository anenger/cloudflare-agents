"use client";

import type { Level, Overview } from "agent/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
	ErrorNote,
	formatDate,
	LEVEL_LABELS,
	ScorePill,
	StatusPill,
} from "~/app/_components/ui";
import { api } from "~/trpc/react";

/** Overview is polled quickly while a grading Workflow is running. */
export function useOverview() {
	return api.coach.overview.useQuery(undefined, {
		refetchInterval: (query) => (query.state.data?.grading ? 1500 : false),
	});
}

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
	const overview = useOverview();

	if (overview.error) return <ErrorNote message={overview.error.message} />;
	if (!overview.data) return <SidebarSkeleton />;

	return (
		<div className="space-y-4">
			<ProfileCard profile={overview.data.profile} />
			<MemoryCard memory={overview.data.memory} />
			<HistoryCard onNavigate={onNavigate} sessions={overview.data.sessions} />
		</div>
	);
}

function ProfileCard({ profile }: { profile: Overview["profile"] }) {
	const [editing, setEditing] = useState(false);
	const utils = api.useUtils();
	const update = api.coach.updateProfile.useMutation({
		onSuccess: async () => {
			await utils.coach.overview.invalidate();
			setEditing(false);
		},
	});

	if (!editing) {
		return (
			<section className="card p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<h2 className="label">Your profile</h2>
						<p className="truncate font-semibold">
							{profile.name || "Anonymous candidate"}
						</p>
						<p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
							{LEVEL_LABELS[profile.level]} {profile.targetRole}
						</p>
					</div>
					<button
						className="text-accent-700 dark:text-accent-500 text-sm hover:underline"
						onClick={() => setEditing(true)}
						type="button"
					>
						Edit
					</button>
				</div>
			</section>
		);
	}

	return (
		<form
			className="card space-y-3 p-4"
			onSubmit={(e) => {
				e.preventDefault();
				const data = new FormData(e.currentTarget);
				update.mutate({
					name: String(data.get("name") ?? ""),
					targetRole: String(data.get("targetRole") ?? ""),
					level: String(data.get("level")) as Level,
				});
			}}
		>
			<h2 className="label">Your profile</h2>
			<div>
				<label className="label" htmlFor="name">
					Name
				</label>
				<input
					className="input"
					defaultValue={profile.name}
					id="name"
					name="name"
				/>
			</div>
			<div>
				<label className="label" htmlFor="targetRole">
					Target role
				</label>
				<input
					className="input"
					defaultValue={profile.targetRole}
					id="targetRole"
					name="targetRole"
					required
				/>
			</div>
			<div>
				<label className="label" htmlFor="level">
					Level
				</label>
				<select
					className="input"
					defaultValue={profile.level}
					id="level"
					name="level"
				>
					{Object.entries(LEVEL_LABELS).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
			</div>
			{update.error && <ErrorNote message={update.error.message} />}
			<div className="flex gap-2">
				<button
					className="btn-primary"
					disabled={update.isPending}
					type="submit"
				>
					Save
				</button>
				<button
					className="btn-secondary"
					onClick={() => setEditing(false)}
					type="button"
				>
					Cancel
				</button>
			</div>
		</form>
	);
}

function MemoryCard({ memory }: { memory: string[] }) {
	const utils = api.useUtils();
	const forget = api.coach.forgetMemory.useMutation({
		onSuccess: () => utils.coach.overview.invalidate(),
	});

	return (
		<section className="card p-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="label mb-0">What your coach remembers</h2>
				{memory.length > 0 && (
					<button
						className="text-xs text-zinc-500 hover:text-rose-600 hover:underline"
						disabled={forget.isPending}
						onClick={() => {
							if (confirm("Clear everything the coach remembers about you?"))
								forget.mutate();
						}}
						type="button"
					>
						Forget
					</button>
				)}
			</div>
			{memory.length === 0 ? (
				<p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
					Nothing yet. After each graded interview, the coach saves notes about
					your strengths and weak spots and uses them to tailor the next one.
				</p>
			) : (
				<ul className="mt-3 space-y-2">
					{memory.map((note) => (
						<li className="flex gap-2 text-sm" key={note}>
							<span
								aria-hidden="true"
								className="bg-accent-500 mt-2 size-1.5 shrink-0 rounded-full"
							/>
							<span>{note}</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function HistoryCard({
	sessions,
	onNavigate,
}: {
	sessions: Overview["sessions"];
	onNavigate: () => void;
}) {
	const pathname = usePathname();

	return (
		<section className="card p-2">
			<h2 className="label px-2 pt-2">Past interviews</h2>
			{sessions.length === 0 ? (
				<p className="px-2 pb-2 text-sm text-zinc-500 dark:text-zinc-400">
					No interviews yet.
				</p>
			) : (
				<ul className="max-h-[50vh] overflow-y-auto">
					{sessions.map((s) => {
						const href = `/sessions/${s.id}`;
						const current = pathname === href;
						return (
							<li key={s.id}>
								<Link
									aria-current={current ? "page" : undefined}
									className={`block rounded-xl px-2 py-2 transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${current ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
									href={href}
									onClick={onNavigate}
								>
									<div className="flex items-center justify-between gap-2">
										<span className="truncate text-sm font-medium">
											{s.role}
										</span>
										{s.status === "graded" && s.score ? (
											<ScorePill score={s.score} />
										) : (
											<StatusPill status={s.status} />
										)}
									</div>
									<p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
										{formatDate(s.startedAt)} · {LEVEL_LABELS[s.level]}
										{s.focus ? ` · ${s.focus}` : ""}
									</p>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

function SidebarSkeleton() {
	return (
		<div aria-hidden="true" className="space-y-4">
			{[80, 120, 160].map((h) => (
				<div className="card animate-pulse" key={h} style={{ height: h }} />
			))}
		</div>
	);
}

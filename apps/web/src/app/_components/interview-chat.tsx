"use client";

import type { ChatRole, SessionDetail } from "agent/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote, Spinner } from "~/app/_components/ui";
import { useDictation, useSpeaker } from "~/app/_components/use-speech";
import { api } from "~/trpc/react";

type ChatMessage = { key: string; role: ChatRole; content: string };

/** The interviewer offers to wrap up after about this many questions. */
const TARGET_QUESTIONS = 5;

export function InterviewChat({ detail }: { detail: SessionDetail }) {
	const sessionId = detail.session.id;
	const utils = api.useUtils();
	const [messages, setMessages] = useState<ChatMessage[]>(() =>
		detail.messages.map((m) => ({
			key: String(m.id),
			role: m.role,
			content: m.content,
		})),
	);
	const [draft, setDraft] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const speaker = useSpeaker();
	const dictationBase = useRef("");
	const dictation = useDictation((text) =>
		setDraft(dictationBase.current ? `${dictationBase.current} ${text}` : text),
	);

	const end = api.coach.endSession.useMutation({
		onSuccess: () =>
			Promise.all([
				utils.coach.session.invalidate({ id: sessionId }),
				utils.coach.overview.invalidate(),
			]),
	});

	const send = useCallback(
		async (content: string | null) => {
			setError(null);
			setStreaming(true);
			const replyKey = `reply-${Date.now()}`;
			setMessages((cur) => [
				...cur,
				...(content
					? [{ key: `me-${Date.now()}`, role: "candidate" as const, content }]
					: []),
				{ key: replyKey, role: "interviewer", content: "" },
			]);

			let reply = "";
			try {
				const res = await fetch(`/api/sessions/${sessionId}/messages`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ content }),
				});
				if (!res.ok || !res.body) {
					const payload = (await res.json().catch(() => null)) as {
						error?: string;
					} | null;
					throw new Error(payload?.error ?? `Request failed (${res.status})`);
				}
				const reader = res.body
					.pipeThrough(new TextDecoderStream())
					.getReader();
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					reply += value;
					setMessages((cur) =>
						cur.map((m) => (m.key === replyKey ? { ...m, content: reply } : m)),
					);
				}
				if (!reply.trim())
					throw new Error("The interviewer didn't respond. Try again.");
				speaker.speak(reply);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong");
				setMessages((cur) =>
					cur.filter((m) => m.key !== replyKey || m.content),
				);
				if (content) setDraft(content);
			} finally {
				setStreaming(false);
				void utils.coach.overview.invalidate();
			}
		},
		[sessionId, speaker, utils],
	);

	// A brand-new session: ask the agent for its opening question (once, even
	// under React Strict Mode's double effects).
	const opened = useRef(false);
	useEffect(() => {
		if (opened.current || detail.messages.length > 0) return;
		opened.current = true;
		void send(null);
	}, [detail.messages.length, send]);

	const bottom = useRef<HTMLDivElement>(null);
	const lastContent = messages.at(-1)?.content;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the transcript grows.
	useEffect(() => {
		bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages.length, lastContent]);

	const submit = () => {
		const text = draft.trim();
		if (!text || streaming) return;
		if (dictation.listening) dictation.stop();
		setDraft("");
		void send(text);
	};

	const questionCount = messages.filter(
		(m) => m.role === "interviewer" && m.content,
	).length;
	const answerCount = messages.filter((m) => m.role === "candidate").length;

	return (
		<div className="card flex flex-col">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					Question {Math.max(questionCount, 1)} · about {TARGET_QUESTIONS} in a
					session
				</p>
				<div className="flex items-center gap-2">
					{speaker.supported && (
						<button
							aria-pressed={speaker.enabled}
							className="btn-secondary px-3 py-1.5"
							onClick={speaker.toggle}
							title="Read the interviewer's messages aloud"
							type="button"
						>
							{speaker.enabled ? "🔊 Voice on" : "🔈 Voice off"}
						</button>
					)}
					<button
						className="btn-primary px-3 py-1.5"
						disabled={streaming || end.isPending || answerCount === 0}
						onClick={() => end.mutate({ id: sessionId })}
						title={
							answerCount === 0
								? "Answer at least one question first"
								: undefined
						}
						type="button"
					>
						{end.isPending && <Spinner />}
						End &amp; grade
					</button>
				</div>
			</div>

			<div
				aria-live="polite"
				className="max-h-[60vh] min-h-72 space-y-4 overflow-y-auto p-4"
			>
				{messages.map((m) => (
					<Bubble key={m.key} role={m.role}>
						{m.content || <TypingDots />}
					</Bubble>
				))}
				<div ref={bottom} />
			</div>

			<div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
				{(error ?? end.error?.message ?? dictation.error) && (
					<ErrorNote
						message={error ?? end.error?.message ?? dictation.error ?? ""}
					/>
				)}
				<form
					className="flex items-end gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<label className="sr-only" htmlFor="answer">
						Your answer
					</label>
					<textarea
						className="input max-h-48 min-h-11 resize-y"
						disabled={end.isPending}
						id="answer"
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (
								e.key === "Enter" &&
								!e.shiftKey &&
								!e.nativeEvent.isComposing
							) {
								e.preventDefault();
								submit();
							}
						}}
						placeholder={
							dictation.listening
								? "Listening… speak your answer"
								: "Type your answer (Shift+Enter for a new line)"
						}
						rows={2}
						value={draft}
					/>
					{dictation.supported && (
						<button
							aria-label={
								dictation.listening ? "Stop dictation" : "Answer by voice"
							}
							aria-pressed={dictation.listening}
							className={`btn h-11 w-11 shrink-0 px-0 ${
								dictation.listening
									? "animate-pulse bg-rose-600 text-white"
									: "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
							}`}
							onClick={() => {
								if (dictation.listening) return dictation.stop();
								dictationBase.current = draft.trim();
								dictation.start();
							}}
							title={dictation.listening ? "Stop dictation" : "Answer by voice"}
							type="button"
						>
							<svg
								aria-hidden="true"
								className="size-5"
								fill="none"
								viewBox="0 0 24 24"
							>
								<rect
									height="12"
									rx="3"
									stroke="currentColor"
									strokeWidth="2"
									width="6"
									x="9"
									y="3"
								/>
								<path
									d="M5 11a7 7 0 0 0 14 0M12 18v3"
									stroke="currentColor"
									strokeLinecap="round"
									strokeWidth="2"
								/>
							</svg>
						</button>
					)}
					<button
						className="btn-primary h-11 shrink-0"
						disabled={streaming || !draft.trim()}
						type="submit"
					>
						{streaming ? <Spinner /> : "Send"}
					</button>
				</form>
			</div>
		</div>
	);
}

export function Bubble({
	role,
	children,
}: {
	role: ChatRole;
	children: React.ReactNode;
}) {
	const mine = role === "candidate";
	return (
		<div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
			<div
				className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
					mine
						? "bg-accent-600 rounded-br-md text-white"
						: "rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
				}`}
			>
				<span className="sr-only">{mine ? "You: " : "Interviewer: "}</span>
				{children}
			</div>
		</div>
	);
}

function TypingDots() {
	return (
		<span
			aria-label="Interviewer is typing"
			className="inline-flex gap-1 py-1"
			role="status"
		>
			{[0, 150, 300].map((d) => (
				<span
					className="size-1.5 animate-bounce rounded-full bg-zinc-400"
					key={d}
					style={{ animationDelay: `${d}ms` }}
				/>
			))}
		</span>
	);
}

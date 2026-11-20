import type { Message, Profile, QuestionFeedback } from "./types";

export type LlmMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

/** Questions in one session before the interviewer offers to wrap up. */
export const QUESTIONS_PER_SESSION = 5;

/** Long-term memory notes kept per candidate. */
export const MAX_MEMORY_NOTES = 8;

/** Most recent turns of the current session sent to the model. */
const MAX_HISTORY_TURNS = 30;

export type InterviewContext = {
	profile: Profile;
	role: string;
	level: string;
	focus: string;
	memory: string[];
	/** Questions asked in earlier sessions, so the interviewer doesn't repeat them. */
	pastQuestions: string[];
};

export function interviewerSystemPrompt(ctx: InterviewContext): string {
	const lines = [
		`You are an experienced, friendly interviewer running a realistic mock interview for a ${ctx.level}-level ${ctx.role} position.`,
		ctx.profile.name ? `The candidate's name is ${ctx.profile.name}.` : "",
		ctx.focus ? `This session focuses on: ${ctx.focus}.` : "",
		"",
		"How to run the interview:",
		"- Ask exactly ONE question per message. Never list several questions at once.",
		"- Mix behavioral questions with role-specific technical questions suited to the level.",
		"- After the candidate answers, react in one short sentence, then either ask one probing follow-up (if the answer was vague) or move on to the next question.",
		"- Do not grade, score or lecture during the interview. Detailed feedback comes afterwards.",
		`- After about ${QUESTIONS_PER_SESSION} main questions, thank the candidate and tell them they can press "End & grade" to get feedback.`,
		"- Keep each message under 90 words. Plain text, no markdown headings.",
	];

	if (ctx.memory.length > 0) {
		lines.push(
			"",
			"What you remember about this candidate from earlier sessions (use it to target practice; e.g. probe known weak spots, but don't recite these notes):",
			...ctx.memory.map((note) => `- ${note}`),
		);
	}

	if (ctx.pastQuestions.length > 0) {
		lines.push(
			"",
			"Questions already asked in earlier sessions. Do NOT repeat them:",
			...ctx.pastQuestions.map((q) => `- ${truncate(q, 160)}`),
		);
	}

	return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
}

/** Builds the chat history for the next interviewer turn. */
export function interviewMessages(
	ctx: InterviewContext,
	history: Pick<Message, "role" | "content">[],
): LlmMessage[] {
	const recent = history.slice(-MAX_HISTORY_TURNS);
	const messages: LlmMessage[] = [
		{ role: "system", content: interviewerSystemPrompt(ctx) },
	];
	if (recent.length === 0) {
		messages.push({
			role: "user",
			content: ctx.profile.name
				? `(The candidate, ${ctx.profile.name}, has joined. Greet them by name in a few words, then ask your first question.)`
				: "(The candidate has joined. Greet them in a few words without using or asking for a name, then ask your first question.)",
		});
	}
	for (const m of recent) {
		messages.push({
			role: m.role === "interviewer" ? "assistant" : "user",
			content: m.content,
		});
	}
	return messages;
}

export type QaPair = { question: string; answer: string };

/**
 * Turns a transcript into question/answer pairs for grading. Each candidate
 * message answers the interviewer message before it; consecutive candidate
 * messages are merged, and a trailing unanswered question is dropped.
 */
export function pairQuestionsAndAnswers(
	messages: Pick<Message, "role" | "content">[],
): QaPair[] {
	const pairs: QaPair[] = [];
	let question: string | null = null;
	let answer: string[] = [];

	const flush = () => {
		if (question !== null && answer.length > 0) {
			pairs.push({ question, answer: answer.join("\n\n") });
		}
		answer = [];
	};

	for (const m of messages) {
		const text = m.content.trim();
		if (!text) continue;
		if (m.role === "interviewer") {
			flush();
			question = text;
		} else if (question !== null) {
			answer.push(text);
		}
	}
	flush();
	return pairs;
}

export function gradingMessages(
	pair: QaPair,
	role: string,
	level: string,
): LlmMessage[] {
	return [
		{
			role: "system",
			content: [
				`You are a rigorous but encouraging hiring manager grading one answer from a mock interview for a ${level}-level ${role} role.`,
				"Score 1-10: 1-3 weak, 4-6 adequate, 7-8 strong, 9-10 exceptional. Short or evasive answers score low.",
				"For behavioral questions, check for structure (situation, task, action, result), specifics, and measurable impact.",
				"For technical questions, check correctness, depth, and trade-offs.",
				"strengths and improvements: 1-3 short, specific bullet points each (no generic advice).",
				"exampleAnswer: a concise, stronger answer (under 120 words) in the candidate's voice. Reuse their facts; never invent technologies, numbers or events. Where a specific detail is missing, write a short placeholder in [brackets] such as [metric] or [tool].",
				"Respond with JSON only.",
			].join("\n"),
		},
		{
			role: "user",
			content: `Interviewer message:\n${pair.question}\n\nCandidate answer:\n${pair.answer}`,
		},
	];
}

export const gradingSchema = {
	type: "object",
	properties: {
		score: { type: "number" },
		strengths: { type: "array", items: { type: "string" } },
		improvements: { type: "array", items: { type: "string" } },
		exampleAnswer: { type: "string" },
	},
	required: ["score", "strengths", "improvements", "exampleAnswer"],
} as const;

export function summaryMessages(
	feedback: QuestionFeedback[],
	memory: string[],
	role: string,
	level: string,
): LlmMessage[] {
	const graded = feedback
		.map(
			(f, i) =>
				`Q${i + 1} (score ${f.score}/10): ${truncate(f.question, 200)}\nStrengths: ${f.strengths.join("; ")}\nImprovements: ${f.improvements.join("; ")}`,
		)
		.join("\n\n");

	return [
		{
			role: "system",
			content: [
				`You are an interview coach writing the debrief for a ${level}-level ${role} mock interview.`,
				"summary: 2-3 sentences on how the session went overall.",
				"strengths / improvements: the 2-4 most important themes across all answers.",
				`memory: an updated list (at most ${MAX_MEMORY_NOTES} items) of durable coaching notes about this candidate for future sessions. Start each note with "Strength:", "Work on:" or "Progress:". Be specific (name the skill or topic, e.g. "Work on: explaining retry and failure handling in event-driven systems"), never generic. Merge with the existing notes: combine duplicates, never keep two notes that contradict each other, and replace outdated notes (e.g. turn a fixed weakness into a Progress note). Each note under 20 words.`,
				"Respond with JSON only.",
			].join("\n"),
		},
		{
			role: "user",
			content: `Existing notes about the candidate:\n${memory.length ? memory.map((m) => `- ${m}`).join("\n") : "(none yet)"}\n\nGraded answers from this session:\n\n${graded}`,
		},
	];
}

export const summarySchema = {
	type: "object",
	properties: {
		summary: { type: "string" },
		strengths: { type: "array", items: { type: "string" } },
		improvements: { type: "array", items: { type: "string" } },
		memory: { type: "array", items: { type: "string" } },
	},
	required: ["summary", "strengths", "improvements", "memory"],
} as const;

export function averageScore(
	feedback: Pick<QuestionFeedback, "score">[],
): number {
	if (feedback.length === 0) return 0;
	const total = feedback.reduce((sum, f) => sum + f.score, 0);
	return Math.round((total / feedback.length) * 10) / 10;
}

export function clampScore(value: unknown): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return 5;
	return Math.min(10, Math.max(1, Math.round(n)));
}

export function cleanList(value: unknown, max: number): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((v): v is string => typeof v === "string")
		.map((v) => v.trim())
		.filter(Boolean)
		.slice(0, max);
}

export function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

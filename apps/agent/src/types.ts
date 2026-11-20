export type Level = "junior" | "mid" | "senior" | "staff";

export type Profile = {
	name: string;
	targetRole: string;
	level: Level;
	/** Free-form areas the candidate wants to practise, e.g. "system design". */
	focusAreas: string[];
};

export type ChatRole = "interviewer" | "candidate";

export type Message = {
	id: number;
	sessionId: string;
	role: ChatRole;
	content: string;
	createdAt: number;
};

export type SessionStatus = "active" | "grading" | "graded" | "failed";

export type SessionSummary = {
	id: string;
	role: string;
	level: Level;
	focus: string;
	status: SessionStatus;
	startedAt: number;
	endedAt: number | null;
	score: number | null;
	questionCount: number;
};

export type QuestionFeedback = {
	question: string;
	answer: string;
	/** 1–10 */
	score: number;
	strengths: string[];
	improvements: string[];
	/** A stronger version of the candidate's answer, written by the grader. */
	exampleAnswer: string;
};

export type SessionReport = {
	/** 1–10, averaged and sanity-checked by the summarizer. */
	overallScore: number;
	summary: string;
	strengths: string[];
	improvements: string[];
	questions: QuestionFeedback[];
};

export type SessionDetail = {
	session: SessionSummary;
	messages: Message[];
	report: SessionReport | null;
};

export type GradingProgress = {
	sessionId: string;
	workflowId: string;
	done: number;
	total: number;
	stage: "grading" | "summarizing" | "saving";
};

/** State synced by the Agents SDK. Durable data lives in SQLite instead. */
export type CoachState = {
	grading: GradingProgress | null;
};

export type Overview = {
	profile: Profile;
	/** What the coach remembers about the candidate across sessions. */
	memory: string[];
	sessions: SessionSummary[];
	grading: GradingProgress | null;
};

export type StartSessionInput = {
	role?: string;
	level?: Level;
	focus?: string;
};

export type GradeSessionParams = { sessionId: string };

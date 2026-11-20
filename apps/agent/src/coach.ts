import { Agent } from "agents";
import { streamChat } from "./llm";
import { type InterviewContext, interviewMessages, truncate } from "./prompts";
import type {
	CoachState,
	GradeSessionParams,
	Level,
	Message,
	Overview,
	Profile,
	SessionDetail,
	SessionReport,
	SessionStatus,
	SessionSummary,
	StartSessionInput,
} from "./types";

const LEVELS: Level[] = ["junior", "mid", "senior", "staff"];

const DEFAULT_PROFILE: Profile = {
	name: "",
	targetRole: "Software Engineer",
	level: "mid",
	focusAreas: [],
};

/** Thrown for request errors; the Worker maps the prefix to an HTTP status. */
function httpError(status: 400 | 404 | 409, message: string): Error {
	return new Error(`${status}: ${message}`);
}

type SessionRow = {
	id: string;
	role: string;
	level: string;
	focus: string;
	status: string;
	started_at: number;
	ended_at: number | null;
	score: number | null;
	report: string | null;
	workflow_id: string | null;
	question_count: number;
};

type MessageRow = {
	id: number;
	session_id: string;
	role: string;
	content: string;
	created_at: number;
};

/**
 * One InterviewCoach per candidate. It is a Durable Object (via the Agents
 * SDK), so every candidate gets a single-threaded actor with its own SQLite
 * database holding their profile, long-term memory and every session.
 */
export class InterviewCoach extends Agent<Env, CoachState> {
	initialState: CoachState = { grading: null };

	async onStart() {
		this.sql`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`;
		this.sql`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      level TEXT NOT NULL,
      focus TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      score REAL,
      report TEXT,
      workflow_id TEXT
    )`;
		this.sql`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`;
		this
			.sql`CREATE INDEX IF NOT EXISTS messages_by_session ON messages (session_id, id)`;
	}

	// ---------------------------------------------------------------------------
	// Profile and memory
	// ---------------------------------------------------------------------------

	getProfile(): Profile {
		return { ...DEFAULT_PROFILE, ...this.readKv<Partial<Profile>>("profile") };
	}

	updateProfile(input: Partial<Profile>): Profile {
		const current = this.getProfile();
		const next: Profile = {
			name: clean(input.name, 60) ?? current.name,
			targetRole: clean(input.targetRole, 80) || current.targetRole,
			level: LEVELS.includes(input.level as Level)
				? (input.level as Level)
				: current.level,
			focusAreas: Array.isArray(input.focusAreas)
				? input.focusAreas
						.map((f) => clean(f, 60))
						.filter((f): f is string => Boolean(f))
						.slice(0, 6)
				: current.focusAreas,
		};
		this.writeKv("profile", next);
		return next;
	}

	getMemory(): string[] {
		return this.readKv<string[]>("memory") ?? [];
	}

	forgetMemory(): void {
		this.writeKv("memory", []);
	}

	getOverview(): Overview {
		return {
			profile: this.getProfile(),
			memory: this.getMemory(),
			sessions: this.listSessions(),
			grading: this.state.grading,
		};
	}

	// ---------------------------------------------------------------------------
	// Sessions
	// ---------------------------------------------------------------------------

	startSession(input: StartSessionInput = {}): SessionSummary {
		const profile = this.getProfile();
		const id = crypto.randomUUID();
		const role = clean(input.role, 80) || profile.targetRole;
		const level = LEVELS.includes(input.level as Level)
			? (input.level as Level)
			: profile.level;
		const focus = clean(input.focus, 120) ?? profile.focusAreas.join(", ");

		this.sql`INSERT INTO sessions (id, role, level, focus, status, started_at)
      VALUES (${id}, ${role}, ${level}, ${focus}, 'active', ${Date.now()})`;
		return this.requireSession(id);
	}

	getSession(sessionId: string): SessionDetail {
		const row = this.requireSessionRow(sessionId);
		return {
			session: toSummary(row),
			messages: this.getMessages(sessionId),
			report: row.report ? (JSON.parse(row.report) as SessionReport) : null,
		};
	}

	deleteSession(sessionId: string): void {
		const row = this.requireSessionRow(sessionId);
		if (row.status === "grading") {
			throw httpError(409, "Session is being graded");
		}
		this.sql`DELETE FROM messages WHERE session_id = ${sessionId}`;
		this.sql`DELETE FROM sessions WHERE id = ${sessionId}`;
	}

	/**
	 * Records the candidate's answer (if any) and streams the interviewer's
	 * reply as UTF-8 text. Call with `content = null` to get the opening
	 * question of a new session.
	 */
	async chat(
		sessionId: string,
		content: string | null,
	): Promise<ReadableStream<Uint8Array>> {
		const row = this.requireSessionRow(sessionId);
		if (row.status !== "active") {
			throw httpError(409, "This interview has ended");
		}

		const text = content?.trim() ?? "";
		if (text) {
			if (text.length > 4000) throw httpError(400, "Answer is too long");
			this.insertMessage(sessionId, "candidate", text);
		} else if (row.question_count > 0) {
			throw httpError(400, "Message is empty");
		}

		const history = this.getMessages(sessionId);
		const ctx: InterviewContext = {
			profile: this.getProfile(),
			role: row.role,
			level: row.level,
			focus: row.focus,
			memory: this.getMemory(),
			pastQuestions: this.pastQuestions(sessionId),
		};

		const deltas = await streamChat(
			this.env.AI,
			interviewMessages(ctx, history),
		);

		// One branch goes to the client; the other is drained here so the reply
		// is saved even if the client disconnects mid-stream.
		const [toClient, toStore] = deltas.tee();
		this.ctx.waitUntil(this.saveReply(sessionId, toStore));
		return toClient.pipeThrough(new TextEncoderStream());
	}

	/** Ends the interview and starts the grading Workflow. */
	async endSession(sessionId: string): Promise<{ workflowId: string }> {
		const row = this.requireSessionRow(sessionId);
		if (row.status === "grading" || row.status === "graded") {
			throw httpError(409, `Session is already ${row.status}`);
		}
		if (this.state.grading) {
			throw httpError(
				409,
				"Another session is being graded. Try again shortly.",
			);
		}

		// Record the grading state before starting the Workflow so progress
		// callbacks that arrive immediately are not dropped.
		const workflowId = crypto.randomUUID();
		const previousStatus = row.status;
		this.sql`UPDATE sessions
      SET status = 'grading', ended_at = COALESCE(ended_at, ${Date.now()}), workflow_id = ${workflowId}
      WHERE id = ${sessionId}`;
		this.setState({
			grading: { sessionId, workflowId, done: 0, total: 0, stage: "grading" },
		});

		try {
			const params: GradeSessionParams = { sessionId };
			await this.runWorkflow("GRADE_SESSION", params, {
				id: workflowId,
				metadata: { sessionId },
			});
		} catch (err) {
			this
				.sql`UPDATE sessions SET status = ${previousStatus} WHERE id = ${sessionId}`;
			this.setState({ grading: null });
			throw err;
		}
		return { workflowId };
	}

	// ---------------------------------------------------------------------------
	// Called by GradeSessionWorkflow over RPC
	// ---------------------------------------------------------------------------

	getGradingInput(sessionId: string) {
		const row = this.requireSessionRow(sessionId);
		return {
			role: row.role,
			level: row.level,
			messages: this.getMessages(sessionId),
			memory: this.getMemory(),
		};
	}

	saveReport(sessionId: string, report: SessionReport, memory: string[]) {
		this.sql`UPDATE sessions
      SET status = 'graded', score = ${report.overallScore}, report = ${JSON.stringify(report)}
      WHERE id = ${sessionId}`;
		this.writeKv("memory", memory);
	}

	// ---------------------------------------------------------------------------
	// Workflow lifecycle callbacks (Agents SDK)
	// ---------------------------------------------------------------------------

	async onWorkflowProgress(
		_workflowName: string,
		workflowId: string,
		progress: unknown,
	) {
		const current = this.state.grading;
		if (!current || current.workflowId !== workflowId) return;
		const p = progress as Partial<NonNullable<CoachState["grading"]>>;
		this.setState({
			grading: {
				...current,
				done: p.done ?? current.done,
				total: p.total ?? current.total,
				stage: p.stage ?? current.stage,
			},
		});
	}

	async onWorkflowComplete(_workflowName: string, workflowId: string) {
		if (this.state.grading?.workflowId === workflowId) {
			this.setState({ grading: null });
		}
	}

	async onWorkflowError(
		_workflowName: string,
		workflowId: string,
		error: string,
	) {
		console.error(`Grading workflow ${workflowId} failed: ${error}`);
		this.sql`UPDATE sessions SET status = 'failed'
      WHERE workflow_id = ${workflowId} AND status = 'grading'`;
		if (this.state.grading?.workflowId === workflowId) {
			this.setState({ grading: null });
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private async saveReply(sessionId: string, stream: ReadableStream<string>) {
		let reply = "";
		try {
			for await (const delta of stream) reply += delta;
		} catch (err) {
			console.error("Interviewer stream failed", err);
		}
		reply = reply.trim();
		if (reply) this.insertMessage(sessionId, "interviewer", reply);
	}

	private insertMessage(
		sessionId: string,
		role: Message["role"],
		content: string,
	) {
		this.sql`INSERT INTO messages (session_id, role, content, created_at)
      VALUES (${sessionId}, ${role}, ${content}, ${Date.now()})`;
	}

	private getMessages(sessionId: string): Message[] {
		return this.sql<MessageRow>`SELECT * FROM messages
      WHERE session_id = ${sessionId} ORDER BY id`.map((m) => ({
			id: m.id,
			sessionId: m.session_id,
			role: m.role as Message["role"],
			content: m.content,
			createdAt: m.created_at,
		}));
	}

	private listSessions(): SessionSummary[] {
		return this.sql<SessionRow>`SELECT s.*,
        (SELECT COUNT(*) FROM messages m
          WHERE m.session_id = s.id AND m.role = 'interviewer') AS question_count
      FROM sessions s ORDER BY s.started_at DESC LIMIT 50`.map(toSummary);
	}

	private requireSessionRow(sessionId: string): SessionRow {
		const [row] = this.sql<SessionRow>`SELECT s.*,
        (SELECT COUNT(*) FROM messages m
          WHERE m.session_id = s.id AND m.role = 'interviewer') AS question_count
      FROM sessions s WHERE s.id = ${sessionId}`;
		if (!row) throw httpError(404, "Session not found");
		return row;
	}

	private requireSession(sessionId: string): SessionSummary {
		return toSummary(this.requireSessionRow(sessionId));
	}

	/** Questions graded in recent earlier sessions, to avoid repeats. */
	private pastQuestions(excludeSessionId: string): string[] {
		const rows = this.sql<{ report: string }>`SELECT report FROM sessions
      WHERE id != ${excludeSessionId} AND report IS NOT NULL
      ORDER BY started_at DESC LIMIT 5`;
		return rows.flatMap((r) =>
			(JSON.parse(r.report) as SessionReport).questions.map((q) =>
				truncate(q.question, 160),
			),
		);
	}

	private readKv<T>(key: string): T | undefined {
		const [row] = this.sql<{
			value: string;
		}>`SELECT value FROM kv WHERE key = ${key}`;
		return row ? (JSON.parse(row.value) as T) : undefined;
	}

	private writeKv(key: string, value: unknown) {
		this
			.sql`INSERT INTO kv (key, value) VALUES (${key}, ${JSON.stringify(value)})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
	}
}

function toSummary(row: SessionRow): SessionSummary {
	return {
		id: row.id,
		role: row.role,
		level: row.level as Level,
		focus: row.focus,
		status: row.status as SessionStatus,
		startedAt: row.started_at,
		endedAt: row.ended_at,
		score: row.score,
		questionCount: Number(row.question_count ?? 0),
	};
}

function clean(value: unknown, max: number): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.trim().slice(0, max);
}

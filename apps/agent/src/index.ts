import { getAgentByName } from "agents";
import type { Profile, StartSessionInput } from "./types";

export { InterviewCoach } from "./coach";
export { GradeSessionWorkflow } from "./grading";

/**
 * Internal JSON API, called by the Next.js app through a service binding.
 * Every route is scoped to one candidate: /api/users/:userId/...
 * Each userId maps to its own InterviewCoach Durable Object.
 */
const ROUTE = /^\/api\/users\/([A-Za-z0-9_-]{8,64})(\/.*)?$/;
const SESSION_ROUTE = /^\/sessions\/([0-9a-f-]{36})(\/messages|\/end)?$/;

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/health") return Response.json({ ok: true });

		const match = ROUTE.exec(url.pathname);
		if (!match) return error(404, "Not found");
		const [, userId, rest = "/"] = match;
		if (!userId) return error(404, "Not found");

		const coach = await getAgentByName(env.InterviewCoach, userId);
		const method = request.method;

		try {
			if (rest === "/overview" && method === "GET") {
				return Response.json(await coach.getOverview());
			}
			if (rest === "/profile" && method === "PUT") {
				return Response.json(
					await coach.updateProfile(await body<Partial<Profile>>(request)),
				);
			}
			if (rest === "/memory" && method === "DELETE") {
				await coach.forgetMemory();
				return Response.json({ ok: true });
			}
			if (rest === "/sessions" && method === "POST") {
				return Response.json(
					await coach.startSession(await body<StartSessionInput>(request)),
				);
			}

			const sessionMatch = SESSION_ROUTE.exec(rest);
			if (sessionMatch) {
				const [, sessionId = "", action] = sessionMatch;
				if (!action && method === "GET") {
					return Response.json(await coach.getSession(sessionId));
				}
				if (!action && method === "DELETE") {
					await coach.deleteSession(sessionId);
					return Response.json({ ok: true });
				}
				if (action === "/messages" && method === "POST") {
					const { content } = await body<{ content?: string | null }>(request);
					const stream = await coach.chat(sessionId, content ?? null);
					return new Response(stream, {
						headers: {
							"content-type": "text/plain; charset=utf-8",
							"cache-control": "no-store",
						},
					});
				}
				if (action === "/end" && method === "POST") {
					return Response.json(await coach.endSession(sessionId));
				}
			}

			return error(404, "Not found");
		} catch (err) {
			return fromError(err);
		}
	},
} satisfies ExportedHandler<Env>;

async function body<T>(request: Request): Promise<T> {
	const text = await request.text();
	if (!text) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error("400: Invalid JSON body");
	}
}

function error(status: number, message: string): Response {
	return Response.json({ error: message }, { status });
}

/** Errors thrown as "404: message" (see coach.ts) keep their status across RPC. */
function fromError(err: unknown): Response {
	const message = err instanceof Error ? err.message : String(err);
	const match = /^(400|404|409): (.*)$/s.exec(message);
	if (match) return error(Number(match[1]), match[2] ?? "Request failed");
	console.error(err);
	return error(500, "Something went wrong");
}

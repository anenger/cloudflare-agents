import { agentFetch } from "~/server/agent";
import { userIdFromHeaders } from "~/server/identity";

/**
 * Streams the interviewer's reply. This is a plain route handler rather than
 * a tRPC procedure so the text can be piped straight from Workers AI, through
 * the agent, to the browser.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const userId = userIdFromHeaders(request.headers);
	if (!userId)
		return Response.json({ error: "Missing candidate id" }, { status: 401 });

	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/.test(id)) {
		return Response.json({ error: "Invalid session id" }, { status: 400 });
	}

	const upstream = await agentFetch(userId, `/sessions/${id}/messages`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: await request.text(),
	});

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

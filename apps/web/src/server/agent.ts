import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Calls the agent Worker (apps/agent) over the AGENT service binding.
 * Service bindings are Worker-to-Worker calls; they never leave Cloudflare's
 * network, and the agent Worker has no public routes of its own.
 */
export async function agentFetch(
	userId: string,
	path: string,
	init?: RequestInit,
): Promise<Response> {
	const { env } = await getCloudflareContext({ async: true });
	return env.AGENT.fetch(
		`https://agent.internal/api/users/${encodeURIComponent(userId)}${path}`,
		init,
	);
}

export class AgentError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export async function agentJson<T>(
	userId: string,
	path: string,
	init?: { method?: string; body?: unknown },
): Promise<T> {
	const response = await agentFetch(userId, path, {
		method: init?.method ?? "GET",
		headers:
			init?.body === undefined
				? undefined
				: { "content-type": "application/json" },
		body: init?.body === undefined ? undefined : JSON.stringify(init.body),
	});
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new AgentError(
			response.status,
			payload?.error ?? `Agent returned ${response.status}`,
		);
	}
	return (await response.json()) as T;
}

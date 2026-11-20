import type { LlmMessage } from "./prompts";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Streams a chat completion from Workers AI and yields plain text deltas.
 * Workers AI streams Server-Sent Events ending with `data: [DONE]`. Each event
 * is an OpenAI-style `chat.completion.chunk` (`choices[0].delta.content`);
 * older responses only carry the legacy `response` field.
 */
export async function streamChat(
	ai: Ai,
	messages: LlmMessage[],
): Promise<ReadableStream<string>> {
	const sse = (await ai.run(MODEL, {
		messages,
		stream: true,
		max_tokens: 400,
		temperature: 0.7,
	})) as ReadableStream<Uint8Array>;

	return sse.pipeThrough(new TextDecoderStream()).pipeThrough(sseToText());
}

/** Parses Workers AI SSE text into text deltas. */
export function sseToText(): TransformStream<string, string> {
	let buffer = "";
	const handleLine = (
		line: string,
		controller: TransformStreamDefaultController<string>,
	) => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) return;
		const data = trimmed.slice(5).trim();
		if (!data || data === "[DONE]") return;
		try {
			const delta = deltaText(JSON.parse(data));
			if (delta) controller.enqueue(delta);
		} catch {
			// Ignore keep-alives and malformed events.
		}
	};

	return new TransformStream({
		transform(chunk, controller) {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) handleLine(line, controller);
		},
		flush(controller) {
			if (buffer) handleLine(buffer, controller);
		},
	});
}

/** Runs a completion constrained to a JSON schema and returns the parsed object. */
export async function runJson<T>(
	ai: Ai,
	messages: LlmMessage[],
	schema: object,
): Promise<T> {
	const result = (await ai.run(MODEL, {
		messages,
		max_tokens: 1200,
		temperature: 0.2,
		response_format: { type: "json_schema", json_schema: schema },
	} as never)) as CompletionShape;

	return parseJsonResponse<T>(completionContent(result));
}

type CompletionShape = {
	response?: unknown;
	choices?: {
		delta?: { content?: unknown };
		message?: { content?: unknown };
	}[];
};

/** Text delta of one streamed event, preferring the OpenAI-style field. */
export function deltaText(event: CompletionShape): string {
	const choice = event.choices?.[0];
	if (choice) {
		const content = choice.delta?.content;
		return typeof content === "string" ? content : "";
	}
	return typeof event.response === "string" ? event.response : "";
}

/** Content of a non-streamed completion (parsed object or raw string). */
export function completionContent(result: CompletionShape): unknown {
	if (result.response && typeof result.response === "object") {
		return result.response;
	}
	const content = result.choices?.[0]?.message?.content;
	if (typeof content === "string" && content) return content;
	return result.response;
}

/** Workers AI returns JSON mode output either already parsed or as a string. */
export function parseJsonResponse<T>(response: unknown): T {
	if (response && typeof response === "object") return response as T;
	if (typeof response === "string") {
		const start = response.indexOf("{");
		const end = response.lastIndexOf("}");
		if (start !== -1 && end > start) {
			return JSON.parse(response.slice(start, end + 1)) as T;
		}
	}
	throw new Error("Model did not return JSON");
}

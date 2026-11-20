import { describe, expect, it } from "vitest";
import { completionContent, parseJsonResponse, sseToText } from "../src/llm";
import {
	averageScore,
	clampScore,
	cleanList,
	interviewerSystemPrompt,
	interviewMessages,
	pairQuestionsAndAnswers,
} from "../src/prompts";
import type { Profile } from "../src/types";

const profile: Profile = {
	name: "Sam",
	targetRole: "Backend Engineer",
	level: "senior",
	focusAreas: [],
};

const ctx = {
	profile,
	role: "Backend Engineer",
	level: "senior",
	focus: "system design",
	memory: ["Answers lack measurable results"],
	pastQuestions: ["Tell me about a time you handled an outage."],
};

describe("pairQuestionsAndAnswers", () => {
	it("pairs each answer with the preceding interviewer message", () => {
		const pairs = pairQuestionsAndAnswers([
			{ role: "interviewer", content: "Q1?" },
			{ role: "candidate", content: "A1" },
			{ role: "interviewer", content: "Q2?" },
			{ role: "candidate", content: "A2 part 1" },
			{ role: "candidate", content: "A2 part 2" },
			{ role: "interviewer", content: "Thanks, that's all!" },
		]);
		expect(pairs).toEqual([
			{ question: "Q1?", answer: "A1" },
			{ question: "Q2?", answer: "A2 part 1\n\nA2 part 2" },
		]);
	});

	it("ignores candidate text before the first question and blank messages", () => {
		expect(
			pairQuestionsAndAnswers([
				{ role: "candidate", content: "hello?" },
				{ role: "interviewer", content: "Q1?" },
				{ role: "candidate", content: "   " },
			]),
		).toEqual([]);
	});
});

describe("interview prompts", () => {
	it("includes memory and past questions in the system prompt", () => {
		const prompt = interviewerSystemPrompt(ctx);
		expect(prompt).toContain("senior-level Backend Engineer");
		expect(prompt).toContain("Answers lack measurable results");
		expect(prompt).toContain("handled an outage");
		expect(prompt).toContain("Sam");
	});

	it("adds a kickoff message for a new session and maps roles", () => {
		expect(interviewMessages(ctx, []).map((m) => m.role)).toEqual([
			"system",
			"user",
		]);
		const msgs = interviewMessages(ctx, [
			{ role: "interviewer", content: "Q1?" },
			{ role: "candidate", content: "A1" },
		]);
		expect(msgs.slice(1)).toEqual([
			{ role: "assistant", content: "Q1?" },
			{ role: "user", content: "A1" },
		]);
	});
});

describe("sseToText", () => {
	it("extracts response deltas across chunk boundaries", async () => {
		const chunks = [
			'data: {"response":"Hel"}\n\nda',
			'ta: {"response":"lo"}\n\n',
			'data: {"response":"","usage":{}}\n\ndata: [DONE]\n\n',
		];
		const stream = new ReadableStream<string>({
			start(c) {
				for (const chunk of chunks) c.enqueue(chunk);
				c.close();
			},
		}).pipeThrough(sseToText());
		let out = "";
		for await (const delta of stream) out += delta;
		expect(out).toBe("Hello");
	});
});

describe("sseToText with OpenAI-style chunks", () => {
	it("reads choices[0].delta.content without double counting response", async () => {
		const events = [
			{
				choices: [{ delta: { role: "assistant", content: "" } }],
				response: "",
			},
			{ choices: [{ delta: { content: "Hi" } }], response: "Hi" },
			{ choices: [{ delta: { content: " there" } }] },
		];
		const text = `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`;
		const stream = new ReadableStream<string>({
			start(c) {
				c.enqueue(text);
				c.close();
			},
		}).pipeThrough(sseToText());
		let out = "";
		for await (const delta of stream) out += delta;
		expect(out).toBe("Hi there");
	});
});

describe("parsing model output", () => {
	it("reads JSON content from either completion format", () => {
		expect(completionContent({ response: { a: 1 } })).toEqual({ a: 1 });
		expect(
			completionContent({ choices: [{ message: { content: '{"a":1}' } }] }),
		).toBe('{"a":1}');
	});

	it("accepts parsed objects and JSON embedded in text", () => {
		expect(parseJsonResponse({ a: 1 })).toEqual({ a: 1 });
		expect(parseJsonResponse('Here you go: {"a": 2}')).toEqual({ a: 2 });
		expect(() => parseJsonResponse("no json")).toThrow();
	});

	it("clamps scores and cleans lists", () => {
		expect(clampScore(11)).toBe(10);
		expect(clampScore("7.4")).toBe(7);
		expect(clampScore("n/a")).toBe(5);
		expect(cleanList([" a ", "", 3, "b", "c"], 2)).toEqual(["a", "b"]);
		expect(averageScore([{ score: 7 }, { score: 8 }, { score: 8 }])).toBe(7.7);
		expect(averageScore([])).toBe(0);
	});
});

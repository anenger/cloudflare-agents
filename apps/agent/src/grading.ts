import type { AgentWorkflowEvent, AgentWorkflowStep } from "agents/workflows";
import { AgentWorkflow } from "agents/workflows";
import type { InterviewCoach } from "./coach";
import { runJson } from "./llm";
import {
	averageScore,
	clampScore,
	cleanList,
	gradingMessages,
	gradingSchema,
	MAX_MEMORY_NOTES,
	pairQuestionsAndAnswers,
	summaryMessages,
	summarySchema,
} from "./prompts";
import type {
	GradeSessionParams,
	GradingProgress,
	QuestionFeedback,
	SessionReport,
} from "./types";

type Progress = Pick<GradingProgress, "done" | "total" | "stage">;

const LLM_RETRY = {
	retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
	timeout: "2 minutes",
} as const;

/**
 * Grades a finished interview. Each answer is graded in its own durable step,
 * so a transient model failure retries just that answer, and finished steps
 * are never re-run if the Workflow is resumed.
 */
export class GradeSessionWorkflow extends AgentWorkflow<
	InterviewCoach,
	GradeSessionParams,
	Progress
> {
	async run(
		event: AgentWorkflowEvent<GradeSessionParams>,
		step: AgentWorkflowStep,
	) {
		const { sessionId } = event.payload;

		const input = await step.do("load-transcript", async () =>
			this.agent.getGradingInput(sessionId),
		);
		const pairs = pairQuestionsAndAnswers(input.messages);
		await this.reportProgress({
			done: 0,
			total: pairs.length,
			stage: "grading",
		});

		const feedback: QuestionFeedback[] = [];
		for (const [i, pair] of pairs.entries()) {
			const graded = await step.do(
				`grade-answer-${i + 1}`,
				LLM_RETRY,
				async () => {
					const raw = await runJson<Record<string, unknown>>(
						this.env.AI,
						gradingMessages(pair, input.role, input.level),
						gradingSchema,
					);
					return {
						question: pair.question,
						answer: pair.answer,
						score: clampScore(raw.score),
						strengths: cleanList(raw.strengths, 3),
						improvements: cleanList(raw.improvements, 3),
						exampleAnswer:
							typeof raw.exampleAnswer === "string"
								? raw.exampleAnswer.trim()
								: "",
					} satisfies QuestionFeedback;
				},
			);
			feedback.push(graded);
			await this.reportProgress({
				done: i + 1,
				total: pairs.length,
				stage: "grading",
			});
		}

		await this.reportProgress({
			done: pairs.length,
			total: pairs.length,
			stage: "summarizing",
		});

		const summary = await step.do(
			"summarize-and-update-memory",
			LLM_RETRY,
			async () => {
				if (feedback.length === 0) {
					return {
						summary:
							"No answers were recorded in this session, so there was nothing to grade.",
						strengths: [],
						improvements: [
							"Answer at least one question before ending the session.",
						],
						memory: input.memory,
					};
				}
				const raw = await runJson<Record<string, unknown>>(
					this.env.AI,
					summaryMessages(feedback, input.memory, input.role, input.level),
					summarySchema,
				);
				return {
					summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
					strengths: cleanList(raw.strengths, 4),
					improvements: cleanList(raw.improvements, 4),
					memory: cleanList(raw.memory, MAX_MEMORY_NOTES),
				};
			},
		);

		const report: SessionReport = {
			overallScore: averageScore(feedback),
			summary: summary.summary,
			strengths: summary.strengths,
			improvements: summary.improvements,
			questions: feedback,
		};

		await this.reportProgress({
			done: pairs.length,
			total: pairs.length,
			stage: "saving",
		});
		await step.do("save-report", async () => {
			await this.agent.saveReport(sessionId, report, summary.memory);
		});

		await step.reportComplete({ sessionId, overallScore: report.overallScore });
		return { sessionId, overallScore: report.overallScore };
	}
}

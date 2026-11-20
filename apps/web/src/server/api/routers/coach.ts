import type {
	Overview,
	Profile,
	SessionDetail,
	SessionSummary,
} from "agent/types";
import { z } from "zod";
import { agentJson } from "~/server/agent";
import { candidateProcedure, createTRPCRouter } from "~/server/api/trpc";

const level = z.enum(["junior", "mid", "senior", "staff"]);
const sessionId = z.object({ id: z.string().uuid() });

export const coachRouter = createTRPCRouter({
	/** Profile, long-term memory, session history and grading progress. */
	overview: candidateProcedure.query(({ ctx }) =>
		agentJson<Overview>(ctx.userId, "/overview"),
	),

	updateProfile: candidateProcedure
		.input(
			z.object({
				name: z.string().max(60).optional(),
				targetRole: z.string().max(80).optional(),
				level: level.optional(),
				focusAreas: z.array(z.string().max(60)).max(6).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			agentJson<Profile>(ctx.userId, "/profile", {
				method: "PUT",
				body: input,
			}),
		),

	forgetMemory: candidateProcedure.mutation(({ ctx }) =>
		agentJson<{ ok: true }>(ctx.userId, "/memory", { method: "DELETE" }),
	),

	startSession: candidateProcedure
		.input(
			z.object({
				role: z.string().max(80).optional(),
				level: level.optional(),
				focus: z.string().max(120).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			agentJson<SessionSummary>(ctx.userId, "/sessions", {
				method: "POST",
				body: input,
			}),
		),

	session: candidateProcedure
		.input(sessionId)
		.query(({ ctx, input }) =>
			agentJson<SessionDetail>(ctx.userId, `/sessions/${input.id}`),
		),

	/** Ends the interview and starts the grading Workflow. */
	endSession: candidateProcedure.input(sessionId).mutation(({ ctx, input }) =>
		agentJson<{ workflowId: string }>(ctx.userId, `/sessions/${input.id}/end`, {
			method: "POST",
		}),
	),

	deleteSession: candidateProcedure
		.input(sessionId)
		.mutation(({ ctx, input }) =>
			agentJson<{ ok: true }>(ctx.userId, `/sessions/${input.id}`, {
				method: "DELETE",
			}),
		),
});

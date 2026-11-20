# PROMPTS.md

This project was built with AI-assisted coding (Claude Code). This file lists the prompts used to build it, followed by the prompts the app itself sends to Llama 3.3 at runtime.

## 1. Prompts used while building

### Initial request

> Build an AI-powered application on Cloudflare. It should include the following components:
> - LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
> - Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
> - User input via chat or voice (recommend using Pages or Realtime)
> - Memory or state

### Choosing the app

The assistant offered four app ideas (study buddy, research assistant, task planner, interview coach). I chose:

> **Interview coach**: a mock interview chat that remembers your past answers and runs a Workflow to grade each session and track progress.

For delivery I chose:

> **Build + run locally**: build it and test it with `wrangler dev`; I'll deploy it later.

### Frontend stack

> Use create-t3-app for the frontend also

This changed the project into a monorepo. The frontend is a create-t3-app (Next.js + tRPC + Tailwind) deployed to Workers with OpenNext. It talks to the agent Worker over a service binding.

### Local testing

While testing, I provided a Cloudflare API token so `wrangler dev` could reach Workers AI. When the first token lacked the permissions that remote bindings need, I updated the same token:

> same token

### What the assistant did with these prompts

- Looked up current docs for the Agents SDK (`Agent`, `runWorkflow`, `AgentWorkflow`) and OpenNext, and checked the installed package type definitions.
- Scaffolded the frontend with `create-t3-app@7.40.0 --CI --trpc --tailwind --appRouter --biome` and set up OpenNext.
- Wrote the agent, workflow, prompts, tRPC router, streaming route and UI, plus unit tests.
- Tested end to end against real Workers AI: curl against the agent, curl through the Next.js app, a headless browser run through the UI (chat, end & grade, live progress, report, light and dark modes, phone width), and the OpenNext production build under `wrangler dev`.
- Fixed problems that testing exposed:
  - Workers AI now returns OpenAI-style `choices` alongside the legacy `response` field. The SSE and JSON parsers handle both without double counting.
  - The opening greeting said "since I don't know your name". The kickoff prompt now depends on whether a name is set.
  - Memory notes contradicted each other, and example answers invented details. Both prompts were tightened (see below).
  - The interview form reset the user's chosen level whenever the overview refetched.
  - The score chart's dots were distorted.

## 2. Prompts the app sends to Llama 3.3

All of these live in [`apps/agent/src/prompts.ts`](apps/agent/src/prompts.ts).

### Interviewer (streamed chat)

The system prompt is built per turn from the session settings and the candidate's memory:

```
You are an experienced, friendly interviewer running a realistic mock interview for a {level}-level {role} position.
The candidate's name is {name}.
This session focuses on: {focus}.

How to run the interview:
- Ask exactly ONE question per message. Never list several questions at once.
- Mix behavioral questions with role-specific technical questions suited to the level.
- After the candidate answers, react in one short sentence, then either ask one probing follow-up (if the answer was vague) or move on to the next question.
- Do not grade, score or lecture during the interview. Detailed feedback comes afterwards.
- After about 5 main questions, thank the candidate and tell them they can press "End & grade" to get feedback.
- Keep each message under 90 words. Plain text, no markdown headings.

What you remember about this candidate from earlier sessions (use it to target practice; e.g. probe known weak spots, but don't recite these notes):
- {memory note}…

Questions already asked in earlier sessions. Do NOT repeat them:
- {past question}…
```

A new session starts with this kickoff message: `(The candidate has joined. Greet them in a few words without using or asking for a name, then ask your first question.)`. If a name is set, the kickoff greets them by name instead.

### Grader (one Workflow step per answer, JSON-schema mode)

```
You are a rigorous but encouraging hiring manager grading one answer from a mock interview for a {level}-level {role} role.
Score 1-10: 1-3 weak, 4-6 adequate, 7-8 strong, 9-10 exceptional. Short or evasive answers score low.
For behavioral questions, check for structure (situation, task, action, result), specifics, and measurable impact.
For technical questions, check correctness, depth, and trade-offs.
strengths and improvements: 1-3 short, specific bullet points each (no generic advice).
exampleAnswer: a concise, stronger answer (under 120 words) in the candidate's voice. Reuse their facts; never invent technologies, numbers or events. Where a specific detail is missing, write a short placeholder in [brackets] such as [metric] or [tool].
Respond with JSON only.
```

Schema: `{ score: number, strengths: string[], improvements: string[], exampleAnswer: string }`

### Debrief and memory update (final Workflow step, JSON-schema mode)

```
You are an interview coach writing the debrief for a {level}-level {role} mock interview.
summary: 2-3 sentences on how the session went overall.
strengths / improvements: the 2-4 most important themes across all answers.
memory: an updated list (at most 8 items) of durable coaching notes about this candidate for future sessions. Start each note with "Strength:", "Work on:" or "Progress:". Be specific (name the skill or topic, e.g. "Work on: explaining retry and failure handling in event-driven systems"), never generic. Merge with the existing notes: combine duplicates, never keep two notes that contradict each other, and replace outdated notes (e.g. turn a fixed weakness into a Progress note). Each note under 20 words.
Respond with JSON only.
```

The user message contains the existing memory notes and every graded answer from the session. Schema: `{ summary: string, strengths: string[], improvements: string[], memory: string[] }`

/**
 * Candidates are anonymous: middleware gives each browser a random id cookie,
 * and that id names the candidate's InterviewCoach Durable Object.
 */
export const USER_COOKIE = "coach_uid";

const USER_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidUserId(
	value: string | undefined | null,
): value is string {
	return typeof value === "string" && USER_ID.test(value);
}

export function userIdFromHeaders(headers: Headers): string | null {
	const cookie = headers.get("cookie") ?? "";
	for (const part of cookie.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === USER_COOKIE) {
			const value = decodeURIComponent(rest.join("="));
			return isValidUserId(value) ? value : null;
		}
	}
	return null;
}

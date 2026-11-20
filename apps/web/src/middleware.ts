import { type NextRequest, NextResponse } from "next/server";
import { isValidUserId, USER_COOKIE } from "~/server/identity";

export function middleware(request: NextRequest) {
	if (isValidUserId(request.cookies.get(USER_COOKIE)?.value)) {
		return NextResponse.next();
	}

	const userId = crypto.randomUUID();
	// Expose the new cookie to this request too, so the first page render
	// already talks to the right agent.
	request.cookies.set(USER_COOKIE, userId);
	const response = NextResponse.next({
		request: { headers: request.headers },
	});
	response.cookies.set(USER_COOKIE, userId, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
	});
	return response;
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

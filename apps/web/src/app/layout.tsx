import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { AppShell } from "~/app/_components/app-shell";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
	title: "Interview Coach",
	description:
		"Mock interviews with an AI coach that remembers you. Built on Cloudflare Workers AI, Agents and Workflows.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={`${geist.variable}`} lang="en">
			<body>
				<TRPCReactProvider>
					<AppShell>{children}</AppShell>
				</TRPCReactProvider>
			</body>
		</html>
	);
}

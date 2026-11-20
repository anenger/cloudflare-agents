"use client";

import Link from "next/link";
import { useState } from "react";

import { Sidebar } from "~/app/_components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
	const [menuOpen, setMenuOpen] = useState(false);

	return (
		<div className="min-h-dvh">
			<header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
				<div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
					<Link className="flex items-center gap-2 font-semibold" href="/">
						<span className="bg-accent-600 grid size-8 place-items-center rounded-lg text-white">
							<svg
								aria-hidden="true"
								className="size-4"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									d="M4 5h16v10H9l-5 4V5Z"
									stroke="currentColor"
									strokeLinejoin="round"
									strokeWidth="2"
								/>
							</svg>
						</span>
						Interview Coach
					</Link>
					<div className="flex items-center gap-2">
						<Link className="btn-primary hidden sm:inline-flex" href="/">
							New interview
						</Link>
						<button
							aria-expanded={menuOpen}
							className="btn-secondary lg:hidden"
							onClick={() => setMenuOpen((v) => !v)}
							type="button"
						>
							{menuOpen ? "Close" : "Profile & history"}
						</button>
					</div>
				</div>
			</header>

			<div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[300px_minmax(0,1fr)]">
				<aside className={`${menuOpen ? "block" : "hidden"} lg:block`}>
					<div className="lg:sticky lg:top-20">
						<Sidebar onNavigate={() => setMenuOpen(false)} />
					</div>
				</aside>
				<main className="min-w-0">{children}</main>
			</div>
		</div>
	);
}

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import("next").NextConfig} */
const config = {
	// `agent` is a workspace package that ships TypeScript source (shared types).
	transpilePackages: ["agent"],
};

export default config;

// Makes Cloudflare bindings (the AGENT service binding) available to
// `getCloudflareContext()` during `next dev`.
initOpenNextCloudflareForDev();

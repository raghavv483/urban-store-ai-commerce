import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // `server-only` throws on import outside a React Server Component, which
      // includes Vitest. The payments modules import it deliberately as a build
      // guard against ever being pulled into a client bundle; stubbing it here
      // keeps that guard in the app while letting the spine be unit-tested.
      "server-only": new URL("./test/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    // `node` is the default because most tests here talk to Prisma, which
    // misbehaves under jsdom. Component tests opt in per-file with a
    // `// @vitest-environment jsdom` docblock on line 1.
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    // Several test files (`db/seed.test.ts`, `auth/session.test.ts`,
    // `db/queries/products.test.ts`) are integration tests that share one
    // live database and call `seed()` in `beforeAll`. Running test files in
    // parallel (Vitest's default) lets one file's `seed()` re-write rows
    // that another file is mid-mutation on (e.g. toggling a product's
    // `active` flag), which is a real race, not a hypothetical one. Force
    // everything to run sequentially instead.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});

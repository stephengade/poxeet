// Runs the database tests against the local Supabase started with `supabase start`.
// Reads the local URL and keys from `supabase status`, so no hosted credentials are ever used.
import { execSync, spawnSync } from "node:child_process";

let status;
try {
  status = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch {
  console.error("Local Supabase isn't running. Start Docker, then run: supabase start");
  process.exit(1);
}

const read = (name) => status.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"))?.[1];
const env = {
  ...process.env,
  TEST_SUPABASE_URL: read("API_URL"),
  TEST_SUPABASE_ANON_KEY: read("ANON_KEY"),
  TEST_SUPABASE_SERVICE_KEY: read("SERVICE_ROLE_KEY"),
};

const result = spawnSync("pnpm", ["exec", "vitest", "run", ...process.argv.slice(2)], { env, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);

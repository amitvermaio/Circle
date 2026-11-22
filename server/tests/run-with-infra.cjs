const { spawnSync } = require("node:child_process");

function runPnpm(...args) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

let status = 1;
try {
  status = runPnpm("run", "test:infra:up");
  if (status === 0) {
    status = runPnpm("exec", "vitest", "run", "--reporter=verbose");
  }
} finally {
  const cleanupStatus = runPnpm("run", "test:infra:down");
  process.exitCode = status || cleanupStatus;
}

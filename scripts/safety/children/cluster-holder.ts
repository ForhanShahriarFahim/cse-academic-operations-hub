/**
 * BUG-48 child: start a disposable cluster, report it on stdout as
 * `HELD {json}`, then end the way the case needs:
 *   wait   - keep the cluster until the parent kills this process
 *   sigint - deliver SIGINT to the harness's own handler
 *   exit   - call process.exit in the middle of the run
 * `--no-watchdog` leaves only the in-process path and the stale sweep.
 * Usage: cluster-holder.ts <SAFE01_PG_BIN> <wait|sigint|exit> [--no-watchdog]
 */
import { withDisposableCluster } from "../pg-cluster";

const [bin, mode, ...flags] = process.argv.slice(2);
let watchdogPid: number | null = null;

withDisposableCluster(bin, async (cluster) => {
  const { root, dataDir } = cluster.run;
  console.log(`HELD ${JSON.stringify({ root, dataDir, port: cluster.port, watchdogPid })}`);
  if (mode === "sigint") process.emit("SIGINT", "SIGINT");
  else if (mode === "exit") process.exit(3);
  await new Promise(() => setInterval(() => undefined, 60_000));
}, {
  watchdog: !flags.includes("--no-watchdog"),
  onStarting: (info) => { watchdogPid = info.watchdogPid; },
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

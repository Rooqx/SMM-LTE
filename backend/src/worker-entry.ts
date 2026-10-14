import { buildContainer } from "./container.js";
import { Worker } from "./orchestration/worker.js";

const container = await buildContainer();
const worker = new Worker(
  container.config,
  container.queue,
  container.orchestration,
  container.emailDelivery,
  container.obsidian,
  container.optionAssistant,
);
let shutdownDeadline: NodeJS.Timeout | null = null;

const shutdown = async (signal: string) => {
  console.log(JSON.stringify({
    level: "info",
    time: new Date().toISOString(),
    component: "worker",
    signal,
    message: "Stopping worker after in-flight jobs complete",
  }));
  worker.stop();
  shutdownDeadline ??= setTimeout(() => {
    console.error(JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      component: "worker",
      message: "Worker exceeded its graceful shutdown deadline",
    }));
    process.exit(1);
  }, container.config.WORKER_SHUTDOWN_GRACE_MS);
  shutdownDeadline.unref();
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await worker.run();
} finally {
  if (shutdownDeadline) clearTimeout(shutdownDeadline);
  await container.pool.end();
}

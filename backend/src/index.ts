import { buildApp } from "./app.js";
import { buildContainer } from "./container.js";

const container = await buildContainer();
const app = await buildApp(container);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down API");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: container.config.HOST, port: container.config.PORT });

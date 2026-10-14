import "fastify";
import type { Principal } from "./principals.js";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

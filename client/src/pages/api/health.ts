import type { APIRoute } from "astro";
import { json } from "@/lib/server/http";

export const GET: APIRoute = () =>
  json({ status: "ok", service: "smm-client" });

import {
  Files,
  Fingerprint,
  MessageCircleHeart,
  Route,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { BrandAreaIcon } from "@/config/brand";

export const BRAND_AREA_ICONS: Record<BrandAreaIcon, LucideIcon> = {
  "message-circle-heart": MessageCircleHeart,
  "users-round": UsersRound,
  target: Target,
  fingerprint: Fingerprint,
  route: Route,
  files: Files,
};

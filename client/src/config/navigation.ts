import {
  Bell,
  ChevronsUpDown,
  CircleUserRound,
  Fingerprint,
  House,
  Library,
  LogOut,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItemConfig {
  key: "today" | "library" | "brand" | "you";
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export const PRIMARY_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    key: "today",
    label: "Today",
    href: "/",
    icon: House,
  },
  {
    key: "library",
    label: "Library",
    href: "/library",
    icon: Library,
  },
  {
    key: "brand",
    label: "Brand",
    href: "/brand",
    icon: Fingerprint,
  },
  {
    key: "you",
    label: "You",
    href: "/you",
    icon: CircleUserRound,
  },
] as const;

export const SHELL_ICONS = {
  brandSpark: Sparkles,
  notifications: Bell,
  workspaceSwitcher: ChevronsUpDown,
  account: CircleUserRound,
  createWorkspace: Plus,
  signOut: LogOut,
} as const;

import {
  Ticket,
  Briefcase,
  Users,
  Building,
  Building2,
  Music,
  Clipboard,
  Calendar,
  MapPin,
  Star,
  Heart,
  Mic,
  ShoppingBag,
  Award,
  Bell,
  Camera,
  type LucideIcon,
} from "lucide-react";

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  ticket: Ticket,
  briefcase: Briefcase,
  users: Users,
  building: Building,
  building2: Building2,
  music: Music,
  clipboard: Clipboard,
  calendar: Calendar,
  pin: MapPin,
  star: Star,
  heart: Heart,
  mic: Mic,
  shop: ShoppingBag,
  award: Award,
  bell: Bell,
  camera: Camera,
};

export const ICON_KEYS = Object.keys(ICON_REGISTRY);

export type ColorTheme =
  | "emerald"
  | "amber"
  | "indigo"
  | "pink"
  | "green"
  | "cyan"
  | "blue"
  | "navy";

export const COLOR_THEMES: ColorTheme[] = [
  "emerald",
  "amber",
  "indigo",
  "pink",
  "green",
  "cyan",
  "blue",
  "navy",
];

export function portalThemeClasses(theme: string) {
  switch (theme) {
    case "amber":
      return { iconBg: "bg-amber-50 border-amber-200", iconColor: "text-amber-600", linkColor: "text-amber-600" };
    case "indigo":
      return { iconBg: "bg-indigo-50 border-indigo-200", iconColor: "text-indigo-600", linkColor: "text-indigo-600" };
    case "pink":
      return { iconBg: "bg-pink-50 border-pink-100", iconColor: "text-pink-500", linkColor: "text-pink-500" };
    case "green":
      return { iconBg: "bg-green-50 border-green-200", iconColor: "text-green-700", linkColor: "text-green-700" };
    case "cyan":
      return { iconBg: "bg-cyan-50 border-cyan-200", iconColor: "text-cyan-600", linkColor: "text-cyan-600" };
    case "blue":
      return { iconBg: "bg-blue-50 border-blue-100", iconColor: "text-blue-600", linkColor: "text-blue-600" };
    case "navy":
      return { iconBg: "bg-slate-100 border-slate-200", iconColor: "text-slate-700", linkColor: "text-slate-700" };
    case "emerald":
    default:
      return { iconBg: "bg-emerald-50 border-emerald-200", iconColor: "text-emerald-600", linkColor: "text-emerald-600" };
  }
}

export function explainerThemeClasses(theme: string) {
  switch (theme) {
    case "amber":
      return { border: "border-amber-500", chipBg: "bg-amber-100", chipText: "text-amber-700", iconBg: "bg-amber-100 text-amber-600" };
    case "indigo":
      return { border: "border-indigo-500", chipBg: "bg-indigo-100", chipText: "text-indigo-700", iconBg: "bg-indigo-100 text-indigo-600" };
    case "pink":
      return { border: "border-pink-500", chipBg: "bg-pink-100", chipText: "text-pink-700", iconBg: "bg-pink-100 text-pink-600" };
    case "green":
      return { border: "border-green-500", chipBg: "bg-green-100", chipText: "text-green-700", iconBg: "bg-green-100 text-green-600" };
    case "cyan":
      return { border: "border-cyan-500", chipBg: "bg-cyan-100", chipText: "text-cyan-700", iconBg: "bg-cyan-100 text-cyan-600" };
    case "blue":
      return { border: "border-blue-500", chipBg: "bg-blue-100", chipText: "text-blue-700", iconBg: "bg-blue-100 text-blue-600" };
    case "navy":
      return { border: "border-slate-700", chipBg: "bg-slate-200", chipText: "text-slate-700", iconBg: "bg-slate-200 text-slate-700" };
    case "emerald":
    default:
      return { border: "border-emerald-500", chipBg: "bg-emerald-100", chipText: "text-emerald-700", iconBg: "bg-emerald-100 text-emerald-600" };
  }
}

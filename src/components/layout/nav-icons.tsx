import { createElement } from 'react';
import {
  Briefcase,
  Building2,
  FileSearch,
  FileStack,
  Gauge,
  Gavel,
  type LucideIcon,
  Plug,
  Radar,
  Award,
  ShieldCheck,
  Upload,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import type { NavIconName } from '@/config/navigation';

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: Gauge,
  customers: Briefcase,
  references: Award,
  imports: Upload,
  tenders: FileSearch,
  matches: Radar,
  deadlines: Timer,
  authorities: Building2,
  awards: Gavel,
  documents: FileStack,
  searchProfiles: ShieldCheck,
  company: Users,
  ai: Sparkles,
  sources: Plug,
  admin: ShieldCheck,
};

/**
 * Renders the icon for a nav entry.
 *
 * Built with `createElement` rather than a locally bound `<Icon />`: the icon
 * component is picked per item, and assigning it to a variable inside a render
 * body would make React treat it as a freshly declared component on every
 * render.
 */
export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  return createElement(ICONS[name], { className, 'aria-hidden': true });
}

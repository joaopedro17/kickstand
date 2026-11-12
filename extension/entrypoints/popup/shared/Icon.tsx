import {
  Bell,
  BellOff,
  Check,
  Copy,
  Download,
  ChevronDown,
  ChevronUp,
  Eye,
  Funnel,
  Image as ImageIcon,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  MonitorOff,
  Plus,
  Radio,
  Search,
  Settings,
  TriangleAlert,
  Tv,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Every icon the popup uses, bundled with the extension. The previous
 * web-component icons downloaded their SVG data from a third-party API at
 * runtime, so they were blank offline and made an undisclosed request.
 */
const ICONS = {
  'alert-triangle': TriangleAlert,
  bell: Bell,
  'bell-off': BellOff,
  check: Check,
  copy: Copy,
  download: Download,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  eye: Eye,
  filter: Funnel,
  image: ImageIcon,
  'layout-grid': LayoutGrid,
  list: List,
  'log-in': LogIn,
  'log-out': LogOut,
  plus: Plus,
  radio: Radio,
  search: Search,
  settings: Settings,
  tv: Tv,
  'tv-off': MonitorOff,
  upload: Upload,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ icon, className = '' }: { icon: IconName; className?: string }) {
  const Svg = ICONS[icon];
  // 1em square, sitting on the text baseline: callers size icons with
  // Tailwind's text-* classes, as they would a glyph.
  return (
    <Svg
      size="1em"
      aria-hidden="true"
      className={`inline-block shrink-0 align-[-0.125em] ${className}`}
    />
  );
}

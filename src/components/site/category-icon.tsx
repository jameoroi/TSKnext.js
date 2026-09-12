const CATEGORY_ICONS: Record<string, string> = {
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/>',
  pump: '<path d="M12 3.5c3 3.3 5.5 6.4 5.5 9.5a5.5 5.5 0 1 1-11 0c0-3.1 2.5-6.2 5.5-9.5Z"/><path d="M9 14.5c0 1.4 1.1 2.5 2.5 2.5"/>',
  bars: '<path d="M12 3v8"/><path d="m8 8 4 4 4-4"/><path d="M4 21h16"/><path d="M6 21v-5M12 21v-3M18 21v-6"/>',
  pipe: '<rect x="3" y="10" width="14" height="4" rx="2"/><circle cx="6" cy="12" r="1"/><path d="M17 10v4"/><path d="M17 11h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2"/>',
  drill:
    '<path d="M2 9.5h7v5H2z"/><path d="M9 10.5h5.5l4.5 1.5v1L14.5 14.5H9"/><path d="M6 14.5V18"/><path d="M4 18h4"/>',
  cordless:
    '<rect x="6" y="4" width="12" height="16" rx="2.4"/><path d="M9.5 4V2.4h5V4"/><path d="M13.2 8.2 9.8 12.6h2.6l-1 3.4 3.9-4.8h-2.6l1-3Z"/>',
  plant:
    '<path d="M12 21v-8.2"/><path d="M12 12.8C6.8 12.8 5 8.7 5 4.6c5.6 0 7.4 3 7 8.2Z"/><path d="M12 12.8c5.2 0 7-4.1 7-8.2-5.6 0-7.4 3-7 8.2Z"/><path d="M7.5 21h9"/>',
  trimmer:
    '<circle cx="12" cy="18.5" r="2"/><path d="M12 16.5V4"/><path d="M8 4h8" stroke-linecap="round"/><path d="m7 8 4-2M17 8l-4-2"/>',
  sprayer:
    '<rect x="6.5" y="6" width="10" height="13" rx="2.2"/><path d="M9 6V3.6h5V6"/><path d="M16.5 9.6h2.7l1.3 2"/><path d="M12 19v2.6"/>',
  boxes:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};

const KEY_ALIASES: Record<string, string> = {
  tools: 'wrench',
  power: 'drill',
  garden: 'plant',
  agri: 'sprayer',
  borewell: 'bars',
  other: 'boxes',
  accessories: 'boxes',
};

export function categoryIconName(icon?: string | null, categoryKey?: string | null) {
  const candidates = [icon, categoryKey].map((v) => String(v || '').toLowerCase());
  for (const c of candidates) {
    if (CATEGORY_ICONS[c]) return c;
    if (KEY_ALIASES[c] && CATEGORY_ICONS[KEY_ALIASES[c]]) return KEY_ALIASES[c];
  }
  return 'boxes';
}

export function CategoryIcon({
  icon,
  categoryKey,
  className,
}: {
  icon?: string | null;
  categoryKey?: string | null;
  className?: string;
}) {
  const name = categoryIconName(icon, categoryKey);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      // Static icon paths from CATEGORY_ICONS above — no user input reaches here.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static allowlisted SVG paths
      dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[name] }}
    />
  );
}

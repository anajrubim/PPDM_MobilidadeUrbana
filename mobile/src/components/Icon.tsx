import { memo } from 'react';
import { SvgXml } from 'react-native-svg';

/** Ícones do UI kit do projeto (traço 2px, viewBox 24). */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  walk: '<circle cx="13" cy="4.2" r="1.7" fill="currentColor" stroke="none"/><path d="M10.2 21l1.1-5.4-2-1.6.6-4 2.6-1.6 2 2.4h2.3M9 14.6l-2.6 2M15 12l2.4 2.2-1 5"/>',
  bus: '<rect x="3" y="5" width="18" height="11" rx="2.2"/><path d="M3 10.5h18"/><circle cx="7.3" cy="18.2" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.7" cy="18.2" r="1.6" fill="currentColor" stroke="none"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  star: '<path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z"/>',
  starfill: '<path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z" fill="currentColor" stroke="none"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3.5 4.5v5h5"/><path d="M12 8v4.3l3 1.9"/>',
  camera: '<path d="M4 8.2h3l1.8-2h6.4l1.8 2h3V19H4z"/><circle cx="12" cy="13.2" r="3.2"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.2v5l3.6 2"/>',
  pin: '<path d="M12 21s7-7.4 7-12.3A7 7 0 105 8.7C5 13.6 12 21 12 21z"/><circle cx="12" cy="8.7" r="2.4"/>',
  wrench: '<path d="M14.7 6.2a4 4 0 00-5.3 5.4L4.3 16.7l3 3 5.1-5.1a4 4 0 005.4-5.3l-2.3 2.3-2.6-.7-.6-2.6z"/>',
  user: '<circle cx="12" cy="8.2" r="3.3"/><path d="M4.8 20c0-4.1 3.1-6.3 7.2-6.3s7.2 2.2 7.2 6.3"/>',
  dots: '<circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  home: '<path d="M4 11.3L12 4l8 7.3"/><path d="M6 10.2V20h12v-9.8"/>',
  map: '<path d="M4 5.5l5-2 6 2 5-2v15l-5 2-6-2-5 2z"/><path d="M9 3.5v15M15 5.5v15"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3" fill="currentColor" stroke="none"/><rect x="18" y="18" width="3" height="3" fill="currentColor" stroke="none"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/>',
  mic: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/><path d="M9 21h6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2.2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1110 3.8 6.8 6.8 0 0020 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  trophy:
    '<path d="M7 4h10v4a5 5 0 01-10 0z"/><path d="M7 5H4v2a4 4 0 004 3.6M17 5h3v2a4 4 0 01-4 3.6"/><path d="M12 13v4M9 21h6M9.5 17h5l.5 4h-6z"/>',
  share:
    '<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 10.8l8-4.4M8 13.2l8 4.4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  upload: '<path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 17v3h16v-3"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 15h6M9 18h3"/>',
  megaphone: '<path d="M3 10v4h3l6 4V6L6 10z"/><path d="M14 9a3 3 0 010 6"/>',
  bars: '<path d="M4 20V10M10 20V4M16 20v-8M4 20h16"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 6l9 7 9-7"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  refresh: '<path d="M20 12a8 8 0 10-2.3 5.6M20 12v5h-5"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M15.5 14.2c2.5.4 4.5 2.2 4.5 5.3"/>',
  flag: '<path d="M5 3v18"/><path d="M5 4h11l-2.5 3.5L16 11H5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.4M12 18.6V21M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M3 12h2.4M18.6 12H21M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>',
  bell: '<path d="M6 10a6 6 0 0112 0c0 4 1.2 5.5 2 6.5H4c.8-1 2-2.5 2-6.5z"/><path d="M10 19a2 2 0 004 0"/>',
  chevrondown: '<path d="M6 9l6 6 6-6"/>',
  building:
    '<rect x="4" y="3" width="10" height="18"/><rect x="14" y="9" width="6" height="12"/><path d="M7 7h1M10 7h1M7 11h1M10 11h1M7 15h1M10 15h1"/>',
  ruler: '<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v3M14 8v3M18 8v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  shopping: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  hospital: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  wifioff: '<path d="M3 3l18 18"/><path d="M10 16.5a5.5 5.5 0 014 0M6.5 12.5a11 11 0 015-1.6M3 8.5a16 16 0 015.2-2.8"/>',
  speaker: '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 000-6H9a3 3 0 010-6h6.5"/>',
  lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z"/>',
} as const;

export type IconName = keyof typeof ICONS;

export const Icon = memo(function Icon({
  name,
  size = 20,
  color = '#1C2833',
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name].replace(/currentColor/g, color)}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
});

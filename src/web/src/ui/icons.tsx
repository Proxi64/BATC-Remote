import type { JSX } from "preact";

type P = { size?: number; class?: string };

const base = (size = 20, cls = "", children: JSX.Element | JSX.Element[]) => (
  <svg class={`icon ${cls}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{children}</svg>
);

export const IconGear = ({ size, class: c }: P) => base(size, c, [
  <circle cx="12" cy="12" r="3" />,
  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
]);
export const IconExpand = ({ size, class: c }: P) => base(size, c, [
  <path d="M4 9V4h5" />, <path d="M20 9V4h-5" />, <path d="M4 15v5h5" />, <path d="M20 15v5h-5" />
]);
export const IconShrink = ({ size, class: c }: P) => base(size, c, [
  <path d="M9 4v5H4" />, <path d="M15 4v5h5" />, <path d="M9 20v-5H4" />, <path d="M15 20v-5h5" />
]);
export const IconRadio = ({ size, class: c }: P) => base(size, c, [
  <path d="M16.5 8 21 3" />, <rect x="3" y="8" width="18" height="12.5" rx="2" />, <circle cx="8.2" cy="14.2" r="2.5" />,
  <path d="M13.5 12H18" />, <path d="M13.5 15.2H18" />, <path d="M13.5 18.4h3" />
]);
export const IconChat = ({ size, class: c }: P) => base(size, c, [<path d="M4 5h16v11H8l-4 4z" />]);
export const IconBolt = ({ size, class: c }: P) => base(size, c, [<path d="M13 2 4 14h7l-1 8 9-12h-7z" />]);
export const IconRefresh = ({ size, class: c }: P) => base(size, c, [
  <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />, <path d="M4 3v5h5" />, <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />, <path d="M20 21v-5h-5" />
]);
export const IconClose = ({ size, class: c }: P) => base(size, c, [<path d="M6 6l12 12" />, <path d="M18 6 6 18" />]);
export const IconArrowDown = ({ size, class: c }: P) => base(size, c, [<path d="M12 5v14" />, <path d="m6 13 6 6 6-6" />]);
export const IconMic = ({ size, class: c }: P) => base(size, c, [
  <rect x="9" y="3" width="6" height="11" rx="3" />, <path d="M6 11a6 6 0 0 0 12 0" />, <path d="M12 17v4" />
]);
export const IconEar = ({ size, class: c }: P) => base(size, c, [
  <path d="M6 9a6 6 0 1 1 12 0c0 3-2 4-3 5.5S14 18 12 19.5a3 3 0 0 1-4.5-1.5" />, <path d="M9 9a3 3 0 0 1 6 0c0 1.5-1.5 2-1.5 3.5" />
]);
export const IconPlane = ({ size, class: c }: P) => base(size, c, [
  <path d="M10.2 20.5 12 15l4.5 3.5 1-1-2.8-5.8L20 8.5a1.6 1.6 0 0 0-2.3-2.3L14.5 9.4 8.7 6.6l-1 1L11 12l-5.5 1.8-2 2 5 1.4 1.4 5z" />
]);
export const IconWifiOff = ({ size, class: c }: P) => base(size, c, [
  <path d="M2 2l20 20" />, <path d="M8.5 16.4a5 5 0 0 1 7 0" />, <path d="M5 12.9a10 10 0 0 1 5.2-2.8" />,
  <path d="M19 12.9a10 10 0 0 0-2.3-1.7" />, <path d="M2 8.8a15 15 0 0 1 4.2-2.6" />, <path d="M22 8.8A15 15 0 0 0 10.7 5" />,
  <path d="M12 20h.01" />
]);
export const IconRunway = ({ size, class: c }: P) => base(size, c, [
  <path d="M9 4h6l4 16H5z" />, <path d="M12 7.5v3" />, <path d="M12 13.5v3" />
]);
export const IconHome = ({ size, class: c }: P) => base(size, c, [<path d="M3 11 12 4l9 7" />, <path d="M5 10v10h14V10" />]);
export const IconPlay = ({ size, class: c }: P) => base(size, c, [<path d="M7 5v14l11-7z" />]);
export const IconQr = ({ size, class: c }: P) => base(size, c, [
  <rect x="3" y="3" width="7" height="7" rx="1" />, <rect x="14" y="3" width="7" height="7" rx="1" />,
  <rect x="3" y="14" width="7" height="7" rx="1" />, <path d="M14 14h3v3h-3z" />, <path d="M21 14v7h-4" />, <path d="M14 21h.01" />
]);
/** Pilot headset with boom microphone (co-pilot bar). */
export const IconHeadset = ({ size, class: c }: P) => base(size, c, [
  <path d="M4 15v-3a8 8 0 0 1 16 0v3" />, <rect x="2.5" y="13.5" width="4" height="6" rx="1.5" />,
  <rect x="17.5" y="13.5" width="4" height="6" rx="1.5" />, <path d="M19.5 19.5c0 1.6-1.9 2.5-4.5 2.5h-1.5" />
]);

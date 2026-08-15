/** Ícones SVG do orçamento público — PROIBIDO usar emojis nesta tela. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const S = (props: P) => <svg viewBox="0 0 24 24" {...props} />;

export const IconCalendar = (p: P) => (
  <S {...p}><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" /></S>
);
export const IconUsers = (p: P) => (
  <S {...p}><circle cx="9" cy="8" r="3" /><path d="M3 19v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M16 7a3 3 0 0 1 0 6M17 14a4 4 0 0 1 4 4v1" /></S>
);
export const IconPlane = (p: P) => (
  <S {...p}><path d="M2 16l20-8-7 7-4 6-2-5-7 0Z" /><path d="M9 16l13-8" /></S>
);
export const IconHotel = (p: P) => (
  <S {...p}><path d="M3 20V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v14M14 10h6a1 1 0 0 1 1 1v9M7 9h3M7 13h3M17 14h1M2 20h20" /></S>
);
export const IconCar = (p: P) => (
  <S {...p}><path d="M5 16v2M19 16v2M3 16h18v-4l-2-5H5L3 12Z" /><circle cx="7.5" cy="16" r="1.5" /><circle cx="16.5" cy="16" r="1.5" /></S>
);
export const IconTicket = (p: P) => (
  <S {...p}><path d="M4 8a2 2 0 0 0 0 8v2h16v-2a2 2 0 0 1 0-8V6H4Z" /><path d="M12 7v10" /></S>
);
export const IconActivity = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" /></S>
);
export const IconTransfer = (p: P) => (
  <S {...p}><path d="M4 17V7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10M4 12h13M20 17V9l-3-2M6 20v-1M18 20v-1" /></S>
);
export const IconShield = (p: P) => (
  <S {...p}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" /><path d="m9 12 2 2 4-4" /></S>
);
export const IconTax = (p: P) => (
  <S {...p}><path d="M4 7h16M4 12h16M4 17h10" /></S>
);
export const IconBag = (p: P) => (
  <S {...p}><path d="M6 8h12v12H6Z" /><path d="M9 8V5h6v3" /></S>
);
export const IconChevron = (p: P) => <S {...p}><path d="m6 9 6 6 6-6" /></S>;
export const IconBack = (p: P) => <S {...p}><path d="m15 18-6-6 6-6" /></S>;
export const IconPin = (p: P) => (
  <S {...p}><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></S>
);
export const IconCard = (p: P) => (
  <S {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></S>
);
export const IconPix = (p: P) => (
  <S {...p}><path d="M12 3 21 12l-9 9-9-9Z" /><path d="M8.5 8.5 12 12l3.5-3.5" /></S>
);
export const IconBoleto = (p: P) => (
  <S {...p}><path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14" /></S>
);
export const IconClock = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>
);
export const IconAlert = (p: P) => (
  <S {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></S>
);
export const IconCheck = (p: P) => <S {...p}><path d="m5 12 4 4 10-10" /></S>;
export const IconWhats = (p: P) => (
  <S {...p}><path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12Z" /><path d="M8.6 9.4c.6 2.6 3.4 5.4 6 6l1.2-1.4-1.9-1-1 .8a7.6 7.6 0 0 1-2.7-2.7l.8-1-1-1.9Z" /></S>
);

export const SUMMARY_ICONS = {
  hotel: IconHotel,
  flight: IconPlane,
  car: IconCar,
  transfer: IconTransfer,
  activity: IconActivity,
  ticket: IconTicket,
  insurance: IconShield,
  service: IconTransfer,
  tax: IconTax,
} as const;

export const IconMoney = (p: P) => (
  <S {...p}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5h.01M18 14.5h.01" /></S>
);

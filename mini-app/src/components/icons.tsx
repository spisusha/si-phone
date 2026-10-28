import type { ReactNode } from 'react';
import type { Category } from '../domain/types';

// Линейные иконки в одном стиле с нижним меню (контур, скруглённые концы).
// Заменяют эмодзи: те на каждом телефоне рисуются по-разному и выглядят «шаблонно».

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 24, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconIphone = (p: IconProps) => (
  <Svg {...p}><rect x="6.5" y="2" width="11" height="20" rx="3" /><path d="M10.5 5h3" /></Svg>
);

export const IconIpad = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="2.5" width="16" height="19" rx="2.5" /><path d="M11 18.5h2" /></Svg>
);

export const IconMacbook = (p: IconProps) => (
  <Svg {...p}><rect x="4.5" y="4.5" width="15" height="11" rx="1.5" /><path d="M2.5 19h19" /></Svg>
);

export const IconWatch = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="6" width="11" height="12" rx="3" />
    <path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3" />
  </Svg>
);

export const IconAirpods = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.5" cy="7" r="3" /><path d="M9.5 9v10" />
    <circle cx="16.5" cy="7" r="3" /><path d="M14.5 9v10" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.5h3l1.8 4.5-2.3 1.4a11 11 0 0 0 7.1 7.1l1.4-2.3 4.5 1.8v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" />
  </Svg>
);

export const IconTelegram = (p: IconProps) => (
  <Svg {...p}><path d="M21 4L3 11l6.5 2.5L12 20l3-4.5 5 3.5 1-15z" /><path d="M9.5 13.5L21 4" /></Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" /></Svg>
);

export const IconChat = (p: IconProps) => (
  <Svg {...p}><path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1-4.3A8.5 8.5 0 1 1 20.5 12z" /></Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.2" /></Svg>
);

export const IconCart = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="20.5" r="1" /><circle cx="19" cy="20.5" r="1" />
    <path d="M1.5 2h3.5l2.6 13a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L22 6.5H6" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9.5" /><path d="M12 11v5.5M12 7.6v.1" /></Svg>
);

export const IconBox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" />
  </Svg>
);

export const IconCheckCircle = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9.5" /><path d="M7.5 12.5l3 3 6-6.5" /></Svg>
);

const CATEGORY_ICONS: Record<Category, (p: IconProps) => ReactNode> = {
  iPhone: IconIphone,
  iPad: IconIpad,
  MacBook: IconMacbook,
  Watch: IconWatch,
  AirPods: IconAirpods,
};

export function CategoryIcon({ category, ...p }: IconProps & { category: Category }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon {...p} />;
}

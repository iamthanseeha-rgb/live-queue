// Inline stroked icons. Inline rather than an icon package so there's no extra
// dependency, no network request, and they inherit colour and size from context.
// All drawn on a 24x24 grid with a 1.7 stroke so they look like one family.

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ size = 24, children, title, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <g {...base}>{children}</g>
    </svg>
  );
}

export const IconMonitor = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M9 20.5h6M12 16.5v4" />
  </Svg>
);

export const IconPhone = (p) => (
  <Svg {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 5.5h3" />
    <circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconBolt = (p) => (
  <Svg {...p}>
    <path d="M13.5 2.5 5 13.5h5.5L9.5 21.5 19 10h-5.8z" />
  </Svg>
);

export const IconWallet = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="5.5" width="19" height="13.5" rx="2.5" />
    <path d="M2.5 10h19" />
    <circle cx="17" cy="14.5" r="1.1" />
  </Svg>
);

export const IconPrinter = (p) => (
  <Svg {...p}>
    <path d="M7 8.5V3.5h10v5" />
    <rect x="3.5" y="8.5" width="17" height="7.5" rx="2" />
    <path d="M7 16.5v4h10v-4" />
  </Svg>
);

export const IconLink = (p) => (
  <Svg {...p}>
    <path d="M10 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 1 0-5.1-5.1l-1.2 1.2" />
    <path d="M14 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 1 0 5.1 5.1l1.2-1.2" />
  </Svg>
);

export const IconQr = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3zM20.5 14v.01M20.5 20.5v.01M14 20.5h3.5" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M4.5 12.5l4.5 4.5 10.5-10.5" />
  </Svg>
);

export const IconArrowRight = (p) => (
  <Svg {...p}>
    <path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" />
  </Svg>
);

export const IconPlus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (p) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconExpand = (p) => (
  <Svg {...p}>
    <path d="M3.5 9V3.5H9M15 3.5h5.5V9M20.5 15v5.5H15M9 20.5H3.5V15" />
  </Svg>
);

export const IconSpeaker = (p) => (
  <Svg {...p}>
    <path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z" />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" />
  </Svg>
);

export const IconSpeakerOff = (p) => (
  <Svg {...p}>
    <path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z" />
    <path d="M16 9.5l4.5 5M20.5 9.5l-4.5 5" />
  </Svg>
);

export const IconDownload = (p) => (
  <Svg {...p}>
    <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 17.5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </Svg>
);

export const IconExternal = (p) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14.5v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h4" />
  </Svg>
);

export const IconShield = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 5.8v5.4c0 4.2 2.8 7.6 7 9.8 4.2-2.2 7-5.6 7-9.8V5.8z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Svg>
);

export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconUsers = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.9c2 .7 3.5 2.6 3.5 5.1" />
  </Svg>
);

export const IconChevron = (p) => (
  <Svg {...p}>
    <path d="M8.5 5.5 15 12l-6.5 6.5" />
  </Svg>
);

export const IconMoon = (p) => (
  <Svg {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z" />
  </Svg>
);

export const IconSun = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </Svg>
);

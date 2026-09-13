// One source of truth for the look of the app.
// The app styles with inline objects, so these are plain objects rather than CSS classes.
// Crimson stays the brand colour; everything around it got calmer so the crimson
// reads as "this is the live number / this is the action" instead of "alert".

export const color = {
  // Brand
  brand: '#E00B41',          // primary fill
  brandHover: '#C0082F',
  brandPress: '#A30630',
  brandText: '#B00734',      // crimson on white, 5.8:1 – safe for text and links
  brandSoft: '#FFF1F4',      // tinted surface
  brandSoftBorder: '#FBD5DE',

  // Neutrals – slightly blue-cast slate, which reads more clinical than pure grey
  ink: '#0B1220',            // headings
  body: '#334155',           // body copy, 9.6:1
  muted: '#5A6B85',          // secondary copy, 4.8:1 on white
  faint: '#61728A',          // tertiary copy – still 4.65:1 on the tinted page background
  line: '#E4E9F0',           // borders
  lineStrong: '#CBD5E1',
  surface: '#FFFFFF',
  page: '#F7F9FC',
  raised: '#FBFCFE',

  // Status
  positive: '#0E7A57',
  positiveSoft: '#E7F7F0',
  warning: '#9A5B00',
  warningSoft: '#FFF6E6',
  danger: '#B42318',
  dangerSoft: '#FEF3F2',

  // Dark display theme (waiting-room TV left on all day)
  darkBg: '#0A0F1A',
  darkPanel: '#111A2B',
  darkLine: '#22304A',
  darkText: '#F1F5F9',
  darkMuted: '#94A9C4',
};

export const font = {
  sans: "'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

// A proper scale instead of ad-hoc sizes. Values are px.
export const size = {
  xs: 12, sm: 13, base: 15, md: 16, lg: 18, xl: 21, '2xl': 26, '3xl': 32, '4xl': 40, '5xl': 52,
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96 };

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

// Layered, neutral shadows. The old pink glow read as a toy; depth should come from
// the shadow and the crimson should come from the fill.
export const shadow = {
  xs: '0 1px 2px rgba(11, 18, 32, 0.05)',
  sm: '0 1px 2px rgba(11, 18, 32, 0.05), 0 2px 6px rgba(11, 18, 32, 0.04)',
  md: '0 2px 4px rgba(11, 18, 32, 0.04), 0 8px 20px rgba(11, 18, 32, 0.06)',
  lg: '0 4px 8px rgba(11, 18, 32, 0.04), 0 18px 40px rgba(11, 18, 32, 0.08)',
  brand: '0 2px 6px rgba(224, 11, 65, 0.20), 0 10px 24px rgba(224, 11, 65, 0.16)',
  focus: '0 0 0 3px rgba(224, 11, 65, 0.28)',
};

// ── Shared component styles ──────────────────────────────────────────

export const panel = {
  background: color.surface,
  border: `1px solid ${color.line}`,
  borderRadius: radius.lg,
  boxShadow: shadow.sm,
  boxSizing: 'border-box',
};

export const buttonBase = {
  fontFamily: font.sans,
  fontWeight: 650,
  fontSize: size.md,
  lineHeight: 1.2,
  borderRadius: radius.pill,
  border: '1px solid transparent',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[2],
  padding: '13px 22px',
  transition: 'background-color .16s ease, box-shadow .16s ease, border-color .16s ease, transform .06s ease',
  textDecoration: 'none',
  boxSizing: 'border-box',
};

export const btnPrimary = {
  ...buttonBase,
  background: color.brand,
  color: '#FFFFFF',
  boxShadow: shadow.brand,
};

export const btnSecondary = {
  ...buttonBase,
  background: color.surface,
  color: color.ink,
  borderColor: color.lineStrong,
  boxShadow: shadow.xs,
};

export const btnQuiet = {
  ...buttonBase,
  background: 'transparent',
  color: color.body,
  borderColor: 'transparent',
  boxShadow: 'none',
};

export const btnDark = {
  ...buttonBase,
  background: color.ink,
  color: '#FFFFFF',
  boxShadow: shadow.md,
};

export const input = {
  fontFamily: font.sans,
  fontSize: size.md,
  color: color.ink,
  background: color.surface,
  border: `1px solid ${color.lineStrong}`,
  borderRadius: radius.md,
  padding: '13px 14px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color .16s ease, box-shadow .16s ease',
};

export const label = {
  display: 'block',
  fontSize: size.sm,
  fontWeight: 650,
  color: color.body,
  marginBottom: space[2],
  letterSpacing: '0.01em',
};

// Small uppercase section label ("NOW SERVING", "CURRENT TOKEN")
export const eyebrow = {
  fontSize: size.xs,
  fontWeight: 750,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: color.muted,
};

export const h1 = {
  fontSize: 'clamp(2.1rem, 5.2vw, 3.6rem)',
  lineHeight: 1.08,
  letterSpacing: '-0.032em',
  fontWeight: 800,
  color: color.ink,
  margin: 0,
};

export const h2 = {
  fontSize: 'clamp(1.55rem, 3.2vw, 2.1rem)',
  lineHeight: 1.18,
  letterSpacing: '-0.022em',
  fontWeight: 780,
  color: color.ink,
  margin: 0,
};

export const h3 = {
  fontSize: size.lg,
  lineHeight: 1.3,
  letterSpacing: '-0.011em',
  fontWeight: 700,
  color: color.ink,
  margin: 0,
};

export const lead = {
  fontSize: 'clamp(1rem, 1.5vw, 1.15rem)',
  lineHeight: 1.6,
  color: color.muted,
  margin: 0,
};

export const body = {
  fontSize: size.base,
  lineHeight: 1.65,
  color: color.body,
  margin: 0,
};

// Digits that never change width, so the token doesn't jump as it counts up.
export const tabularNums = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};

export const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

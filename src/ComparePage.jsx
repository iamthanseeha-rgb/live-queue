import React from 'react';
import {
  color, font, size, radius, shadow, space,
  h1, h2, h3, lead, body, eyebrow, panel, btnPrimary, btnSecondary, tabularNums,
} from './lib/theme';
import { IconCheck, IconArrowRight, IconExternal } from './lib/icons';

// ── What this page is for ────────────────────────────────────────────────
//
// /welcome sells LiveQueue to someone who already wants a token display. This
// page answers the question people type BEFORE that: "what does a token system
// cost?" Most of them are about to buy a display board off IndiaMART or Amazon,
// because that is the only option they know exists.
//
// So it is written to be useful to someone who then buys a board anyway. Every
// price below is a real published figure with its source named, the honest case
// for hardware is made rather than buried, and the last section says plainly
// when hardware is the better answer. A comparison that only flatters us would
// be both dishonest and — since the reader can open IndiaMART in the next tab —
// unconvincing.
//
// Prices were checked in October 2026. PRICES_CHECKED is printed on the page so
// a reader can judge how stale they are, and it is a prompt to re-check them.

const PRICES_CHECKED = 'October 2026';

// A table caption screen readers announce but sighted users do not see. Defined
// up here rather than at the bottom so it exists before the component reads it.
const srCaption = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const WHATSAPP =
  'https://wa.me/918921677207?text=Hi%20LiveQueue%20Team%2C%20I%20saw%20your%20pricing%20page%20and%20want%20to%20know%20more%3A';

// Real listings, named so a reader can go and check them.
const HARDWARE = [
  { what: 'LCD token display, single counter', price: '₹2,500', where: 'IndiaMART' },
  { what: 'Token display system, single counter', price: '₹3,500', where: 'IndiaMART' },
  { what: 'Wall-mounted 3-digit display', price: '₹6,500', where: 'IndiaMART' },
  { what: 'Wireless display, four counters', price: '₹6,500', where: 'IndiaMART' },
  { what: 'Hospital token display system', price: '₹7,500', where: 'IndiaMART' },
  { what: 'Multi-counter display system', price: '₹40,000', where: 'IndiaMART' },
];

const ROWS = [
  {
    label: 'What you pay to start',
    board: '₹2,500 – ₹7,500 for a single counter',
    saas: 'Monthly from day one',
    lq: 'Nothing. 1,500 calls are free',
  },
  {
    label: 'What you pay after that',
    board: 'Nothing, until it breaks',
    saas: 'Every month, whether you use it or not',
    lq: '₹99 per 500 calls, only when you run out',
  },
  {
    label: 'Patient sees the number on their phone',
    board: 'No — only in the room',
    saas: 'Usually yes',
    lq: 'Yes, by scanning your QR poster',
  },
  {
    label: 'Works without internet',
    board: 'Yes',
    saas: 'No',
    lq: 'No',
    boardWins: true,
  },
  {
    label: 'Setup',
    board: 'Mounting, wiring, a remote to learn',
    saas: 'Onboarding call, account setup',
    lq: 'Open a link on the TV you already own',
  },
  {
    label: 'If it stops working',
    board: 'Repair or replace the unit',
    saas: 'Support ticket',
    lq: 'Reload the page',
  },
];

function Section({ children, tint, style }) {
  return (
    <section style={{
      background: tint || 'transparent',
      borderTop: tint ? `1px solid ${color.line}` : 'none',
      borderBottom: tint ? `1px solid ${color.line}` : 'none',
      padding: '0 20px',
      ...style,
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {children}
      </div>
    </section>
  );
}

function Logo({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="LiveQueue home"
      style={{
        display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
        background: 'none', border: 'none', padding: 0, font: 'inherit',
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: 9, background: color.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(224, 11, 65, 0.25)',
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8.5h10M7 12.5h6M7 16.5h3" />
        </svg>
      </span>
      <span className="lq-logo-text" style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.025em', color: color.ink }}>
        live<span style={{ color: color.brand }}>queue</span>
      </span>
    </button>
  );
}

export default function ComparePage({ onGetStarted, onSignIn, onGoHome, onNavigate }) {
  const footerLink = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: color.muted, fontSize: size.sm, fontFamily: font.sans, textAlign: 'left',
  };

  const cell = {
    padding: `${space[4]}px ${space[4]}px`,
    borderBottom: `1px solid ${color.line}`,
    fontSize: size.base,
    lineHeight: 1.5,
    color: color.body,
    verticalAlign: 'top',
  };

  const headCell = {
    ...cell,
    fontWeight: 700,
    color: color.ink,
    fontSize: size.sm,
    letterSpacing: '0.02em',
    background: color.page,
    borderBottom: `1px solid ${color.lineStrong}`,
  };

  return (
    <div style={{
      minHeight: '100vh', background: color.surface, fontFamily: font.sans,
      color: color.body, display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(255,255,255,0.86)',
        backdropFilter: 'saturate(180%) blur(12px)',
        WebkitBackdropFilter: 'saturate(180%) blur(12px)',
        borderBottom: `1px solid ${color.line}`,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 66, padding: '0 20px', maxWidth: 1080, margin: '0 auto',
          width: '100%', boxSizing: 'border-box',
        }}>
          <Logo onClick={onGoHome} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onSignIn} className="lq-hdr-btn" style={{ ...btnSecondary, padding: '9px 16px', fontSize: size.sm }}>
              Sign In
            </button>
            <button onClick={onGetStarted} className="lq-hdr-btn" style={{ ...btnPrimary, padding: '10px 18px', fontSize: size.sm }}>
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ── Opening ── */}
      <Section style={{ paddingTop: space[16], paddingBottom: space[12] }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ ...eyebrow, marginBottom: space[3] }}>Pricing comparison</div>
          <h1 style={{ ...h1 }}>What a token display system costs an Indian clinic</h1>
          <p style={{ ...lead, marginTop: space[5] }}>
            Three ways to show patients which number you are on, and what each one
            actually costs over a year. Prices below are published listings, checked
            in {PRICES_CHECKED}, with the source named so you can go and look.
          </p>
        </div>
      </Section>

      {/* ── The three options ── */}
      <Section tint={color.page} style={{ paddingTop: space[12], paddingBottom: space[12] }}>
        <h2 style={{ ...h2, marginBottom: space[8] }}>The three options</h2>

        <div style={{
          display: 'grid', gap: space[5],
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}>
          {/* Option 1 */}
          <div style={{ ...panel, padding: space[6] }}>
            <div style={{ ...eyebrow, marginBottom: space[2] }}>Option 1</div>
            <h3 style={{ ...h3, marginBottom: space[3] }}>Buy a token display board</h3>
            <div style={{ ...tabularNums, fontSize: size['2xl'], fontWeight: 800, color: color.ink, marginBottom: space[2] }}>
              ₹2,500 – ₹7,500
            </div>
            <p style={{ ...body, color: color.muted, marginBottom: space[4] }}>
              One-time, for a single counter. Multi-counter systems run to ₹40,000
              and above.
            </p>
            <p style={{ ...body }}>
              An LED or LCD unit on the waiting-room wall with a remote or a keypad
              at the desk. It is the option most clinics find first, and for a clinic
              with unreliable internet it is the right one.
            </p>
          </div>

          {/* Option 2 */}
          <div style={{ ...panel, padding: space[6] }}>
            <div style={{ ...eyebrow, marginBottom: space[2] }}>Option 2</div>
            <h3 style={{ ...h3, marginBottom: space[3] }}>Subscribe to queue software</h3>
            <div style={{ ...tabularNums, fontSize: size['2xl'], fontWeight: 800, color: color.ink, marginBottom: space[2] }}>
              Monthly, per location
            </div>
            <p style={{ ...body, color: color.muted, marginBottom: space[4] }}>
              Often priced in dollars rather than rupees.
            </p>
            <p style={{ ...body }}>
              Full queue-management platforms with appointments, analytics and
              multi-branch reporting. Built for hospitals and bank branches. If you
              run one clinic with one doctor, you would be paying every month for
              features you will not open.
            </p>
          </div>

          {/* Option 3 */}
          <div style={{
            ...panel,
            padding: space[6],
            borderColor: color.brandSoftBorder,
            background: color.brandSoft,
            boxShadow: shadow.md,
          }}>
            <div style={{ ...eyebrow, marginBottom: space[2], color: color.brandText }}>Option 3</div>
            <h3 style={{ ...h3, marginBottom: space[3] }}>Use the screen you already own</h3>
            <div style={{ ...tabularNums, fontSize: size['2xl'], fontWeight: 800, color: color.brandText, marginBottom: space[2] }}>
              ₹0 to start
            </div>
            <p style={{ ...body, color: color.muted, marginBottom: space[4] }}>
              1,500 calls free, then ₹99 per 500 calls.
            </p>
            <p style={{ ...body }}>
              LiveQueue opens as a web page on the Smart TV, tablet or old laptop
              already in your waiting room, and the same number appears on every
              patient's phone when they scan your QR poster.
            </p>
          </div>
        </div>
      </Section>

      {/* ── What the boards actually cost ── */}
      <Section style={{ paddingTop: space[16], paddingBottom: space[12] }}>
        <div style={{ maxWidth: 760, marginBottom: space[8] }}>
          <h2 style={{ ...h2 }}>What token display boards actually sell for</h2>
          <p style={{ ...lead, marginTop: space[4] }}>
            Published listings on IndiaMART, checked in {PRICES_CHECKED}. Across the
            whole category, prices run from about ₹2,500 to ₹75,000 depending on the
            number of counters and whether voice calling is included.
          </p>
        </div>

        <div style={{ ...panel, overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption style={{ ...srCaption }}>
              Published prices for token display hardware in India
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ ...headCell, textAlign: 'left' }}>Unit</th>
                <th scope="col" style={{ ...headCell, textAlign: 'right' }}>Listed price</th>
                <th scope="col" style={{ ...headCell, textAlign: 'left' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {HARDWARE.map((h) => (
                <tr key={h.what}>
                  <th scope="row" style={{ ...cell, fontWeight: 600, color: color.ink, textAlign: 'left' }}>
                    {h.what}
                  </th>
                  <td style={{ ...cell, ...tabularNums, textAlign: 'right', fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
                    {h.price}
                  </td>
                  <td style={{ ...cell, color: color.muted }}>{h.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ ...body, color: color.muted, marginTop: space[4], fontSize: size.sm }}>
          These are seller-listed prices before delivery, mounting and any wiring.
          We do not sell hardware and have no arrangement with any of these sellers.
        </p>
      </Section>

      {/* ── Side by side ── */}
      <Section tint={color.page} style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{ maxWidth: 760, marginBottom: space[8] }}>
          <h2 style={{ ...h2 }}>Side by side</h2>
          <p style={{ ...lead, marginTop: space[4] }}>
            One row is marked where the board genuinely wins. It is the row that
            decides this for a lot of clinics.
          </p>
          {/* On a phone the table is wider than the screen and scrolls inside its
              own panel. Without this line nobody knows the other columns exist —
              a scrollbar does not show on touch until you already swiped. */}
          <p
            className="lq-scroll-hint"
            style={{ ...body, fontSize: size.sm, color: color.muted, marginTop: space[4] }}
            aria-hidden="true"
          >
            Swipe the table sideways to see the other two →
          </p>
        </div>

        <div style={{ ...panel, overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...headCell, textAlign: 'left' }}> </th>
                <th scope="col" style={{ ...headCell, textAlign: 'left', color: color.brandText }}>LiveQueue</th>
                <th scope="col" style={{ ...headCell, textAlign: 'left' }}>Display board</th>
                <th scope="col" style={{ ...headCell, textAlign: 'left' }}>Subscription software</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row" style={{ ...cell, fontWeight: 650, color: color.ink, textAlign: 'left' }}>
                    {r.label}
                  </th>
                  <td style={{ ...cell, fontWeight: 600, color: color.ink }}>{r.lq}</td>
                  <td style={{
                    ...cell,
                    background: r.boardWins ? color.positiveSoft : 'transparent',
                    fontWeight: r.boardWins ? 650 : 400,
                    color: r.boardWins ? color.positive : color.body,
                  }}>
                    {r.board}
                  </td>
                  <td style={cell}>{r.saas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── The honest yearly maths ── */}
      <Section style={{ paddingTop: space[16], paddingBottom: space[12] }}>
        <div style={{ maxWidth: 760 }}>
          <h2 style={{ ...h2 }}>What a year actually costs</h2>
          <p style={{ ...lead, marginTop: space[4], marginBottom: space[8] }}>
            Take a clinic seeing 40 patients a day, six days a week. That is about
            1,040 token calls a month.
          </p>
        </div>

        <div style={{
          display: 'grid', gap: space[5],
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          marginBottom: space[8],
        }}>
          <div style={{ ...panel, padding: space[6] }}>
            <h3 style={{ ...h3, marginBottom: space[3] }}>A ₹6,500 display board</h3>
            <p style={{ ...body }}>
              ₹6,500 in year one, then nothing until it fails. Over three years, if
              nothing breaks, roughly ₹2,170 a year. Genuinely cheap — as long as you
              never want the number on a patient's phone.
            </p>
          </div>

          <div style={{ ...panel, padding: space[6] }}>
            <h3 style={{ ...h3, marginBottom: space[3] }}>LiveQueue</h3>
            <p style={{ ...body }}>
              The first 1,500 calls are free, which is about six weeks at this volume.
              After that 1,040 calls a month costs about <strong style={{ color: color.ink }}>₹206</strong>,
              so roughly ₹2,500 a year — and nothing at all in the months the clinic
              is quiet, because you only buy calls when you run out.
            </p>
          </div>
        </div>

        <div style={{
          ...panel,
          padding: space[6],
          background: color.warningSoft,
          borderColor: '#F3E3C3',
          maxWidth: 760,
        }}>
          <h3 style={{ ...h3, marginBottom: space[3] }}>So the money is close — and the board is slightly cheaper</h3>
          <p style={{ ...body }}>
            Over three years the board works out about ₹330 a year less than
            LiveQueue, assuming it never needs repairing. We are not going to
            pretend otherwise: on cost alone, at this volume, there is nothing in
            it, and nobody should change anything to save ₹330 a year.
          </p>
          <p style={{ ...body, marginTop: space[4] }}>
            The difference worth paying for is a different one. A board shows the
            number only to people standing in your waiting room. LiveQueue also puts
            it on the phone of the patient who stepped out to the chemist — which is
            the whole reason reception stops being asked "how long more?" every two
            minutes. If that does not matter to you, buy the board.
          </p>
        </div>
      </Section>

      {/* ── When to buy the board instead ── */}
      <Section tint={color.page} style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{ maxWidth: 760 }}>
          <h2 style={{ ...h2, marginBottom: space[5] }}>When you should buy the board instead</h2>
          <p style={{ ...lead, marginBottom: space[6] }}>
            We would rather you spent ₹6,500 well than ₹0 badly. Buy the hardware if:
          </p>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space[4] }}>
            {[
              'Your clinic internet drops for long stretches. A board keeps working with no connection at all; LiveQueue needs the screen to be online.',
              'You want nothing on screen but the number, on a dedicated unit nobody can navigate away from or switch to YouTube.',
              'There is no TV, tablet, laptop or spare phone in the waiting area, and you would have to buy a screen anyway.',
              'You would rather own a thing than depend on a service staying in business. That is a fair thing to want, and we would not argue with it.',
            ].map((t) => (
              <li key={t} style={{ display: 'flex', gap: space[3], alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, marginTop: 3, color: color.muted }}>
                  <IconCheck size={18} />
                </span>
                <span style={{ ...body }}>{t}</span>
              </li>
            ))}
          </ul>

          <p style={{ ...body, marginTop: space[8] }}>
            If none of those is true, the screen already hanging in your waiting room
            will do the job, and you can find out for free.
          </p>
        </div>
      </Section>

      {/* ── Close ── */}
      <Section style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{
          ...panel,
          padding: `${space[12]}px ${space[8]}px`,
          textAlign: 'center',
          background: color.brandSoft,
          borderColor: color.brandSoftBorder,
        }}>
          <h2 style={{ ...h2, marginBottom: space[4] }}>Try it before you buy anything</h2>
          <p style={{ ...lead, maxWidth: 560, margin: `0 auto ${space[8]}px` }}>
            1,500 token calls free, no card, no monthly plan. Set your desk up in two
            minutes and put it on the waiting-room screen this afternoon.
          </p>
          <div style={{ display: 'flex', gap: space[3], justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} style={{ ...btnPrimary, padding: '14px 26px', fontSize: size.md }}>
              Start free <IconArrowRight size={17} />
            </button>
            <button onClick={() => onNavigate('welcome')} style={{ ...btnSecondary, padding: '14px 26px', fontSize: size.md }}>
              See how it works
            </button>
          </div>
          <p style={{ ...body, fontSize: size.sm, color: color.muted, marginTop: space[6] }}>
            Questions first?{' '}
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ color: color.brandText, fontWeight: 600 }}>
              Message us on WhatsApp <IconExternal size={13} />
            </a>
          </p>
        </div>
      </Section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${color.line}`, padding: `${space[10]}px 20px`, marginTop: 'auto' }}>
        <div style={{
          maxWidth: 1080, margin: '0 auto',
          display: 'flex', flexWrap: 'wrap', gap: space[5],
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Logo onClick={onGoHome} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[5] }}>
            <button onClick={() => onNavigate('welcome')} style={footerLink}>How it works</button>
            <button onClick={() => onNavigate('contact')} style={footerLink}>Contact Us</button>
            <button onClick={() => onNavigate('privacy')} style={footerLink}>Privacy Policy</button>
            <button onClick={() => onNavigate('terms')} style={footerLink}>Terms of Service</button>
            <button onClick={() => onNavigate('refunds')} style={footerLink}>Refund Policy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

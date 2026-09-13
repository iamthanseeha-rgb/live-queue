import React from 'react';
import {
  color, font, size, radius, shadow, space,
  h1, h2, h3, lead, body, eyebrow, panel, btnPrimary, btnSecondary, tabularNums,
} from './lib/theme';
import {
  IconMonitor, IconPhone, IconBolt, IconWallet, IconPrinter, IconLink,
  IconCheck, IconArrowRight, IconShield, IconClock, IconQr, IconExternal,
} from './lib/icons';

const WHATSAPP = 'https://wa.me/918921677207?text=Hi%20LiveQueue%20Team%2C%20I%20saw%20your%20app%20and%20want%20to%20know%20more%20about%20setting%20it%20up%3A';

const FEATURES = [
  {
    Icon: IconMonitor,
    title: 'Zero hardware cost',
    desc: 'Your live queue runs on the Smart TV, tablet or monitor you already own. No LED token machine to buy, wire or repair.',
  },
  {
    Icon: IconPhone,
    title: 'Patients track from their phone',
    desc: 'They scan the counter QR once and watch their position update live — so they can wait outside, in the car, or down the street without losing their turn.',
  },
  {
    Icon: IconBolt,
    title: 'One tap to call the next',
    desc: 'Advance the token from reception or the consulting room. Every screen watching updates within a second.',
  },
  {
    Icon: IconWallet,
    title: 'Pay as you go',
    desc: 'No monthly lock-in. Start with 1,500 calls free, then top up from ₹99 only when you actually need to.',
  },
  {
    Icon: IconPrinter,
    title: 'Printable QR poster',
    desc: 'A clean A4 poster for your entrance or counter, generated from your desk and ready to print in one click.',
  },
  {
    Icon: IconLink,
    title: 'Your own clinic link',
    desc: 'Pick an address patients remember — livequeue.co.in/dr-adam — and reuse it on prescriptions, boards and WhatsApp.',
  },
];

const STEPS = [
  { n: '1', title: 'Create your desk', desc: 'Sign up with an email. You get a private controller and your own counter link straight away.' },
  { n: '2', title: 'Open it on your screen', desc: 'Put the link on the waiting-area TV and print the QR poster for the entrance.' },
  { n: '3', title: 'Call the next patient', desc: 'Tap “+1 Next Token” as each consultation ends. The screen and every phone follow along.' },
];

const PACKS = [
  { tokens: '500', price: '99', name: 'Starter', per: '≈20 paise a patient', note: 'Good for a single doctor testing it for a month.' },
  { tokens: '1,500', price: '249', name: 'Standard', per: '≈17 paise a patient', note: 'The usual choice for a busy OP desk.', featured: true },
  { tokens: '5,000', price: '699', name: 'Pro', per: '≈14 paise a patient', note: 'For multi-doctor clinics and long OP hours.' },
];

const FAQS = [
  {
    q: 'Do I need to buy any equipment?',
    a: 'No. If you have a Smart TV, an Android TV box, a tablet, a laptop or even a spare phone, you can display the queue on it. You open your counter link in the browser and put it on full screen.',
  },
  {
    q: 'What happens when my free calls run out?',
    a: 'The display keeps working and patients keep seeing the current number — you just can’t advance the token until you top up. Recharges start at ₹99 for 500 calls and are added instantly.',
  },
  {
    q: 'Is a call charged if I tap the wrong number?',
    a: 'Tapping “Previous” within two minutes returns the call to your balance, up to three times in a row, so an honest mis-tap costs you nothing.',
  },
  {
    q: 'Do patients need to install an app?',
    a: 'No. They scan the QR code or open your link in any browser. Nothing to install, no sign-up, and no personal details are collected from them.',
  },
  {
    q: 'Does it work if my internet drops for a moment?',
    a: 'The display reconnects on its own and re-checks the number, so a brief drop doesn’t leave a stale token on the screen. It also re-syncs every minute as a safety net.',
  },
  {
    q: 'Can I change my clinic name or link later?',
    a: 'Yes, both, from your desk. Old links keep working and redirect to the new one, so a poster already on your wall doesn’t become dead.',
  },
];

// A small mock of the real product for the hero. Built from divs rather than a
// screenshot so it stays sharp on every screen and never goes out of date.
function ProductPreview() {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 520, margin: '0 auto' }}>
      {/* Waiting-room screen */}
      <div style={{
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderRadius: radius.lg,
        boxShadow: shadow.lg,
        padding: '18px 18px 22px',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: color.brandSoft, border: `1px solid ${color.brandSoftBorder}`,
            color: color.brandText, borderRadius: radius.pill, padding: '4px 10px',
            fontSize: 10, fontWeight: 750, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: color.brand, display: 'block' }} />
            Live
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: color.faint }}>Room 2</div>
        </div>

        <div style={{ textAlign: 'center', paddingBottom: 6 }}>
          <div style={{ ...eyebrow, fontSize: 10, marginBottom: 2 }}>Now serving</div>
          <div style={{
            ...tabularNums,
            fontSize: 'clamp(72px, 20vw, 128px)',
            lineHeight: 0.92,
            fontWeight: 800,
            letterSpacing: '-0.05em',
            color: color.brand,
          }}>
            14
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: color.ink, marginTop: 6 }}>Dr Adam Clinic</div>
        </div>
      </div>

      {/* Patient's phone, overlapping the corner (stacks underneath on a narrow screen) */}
      <div className="lq-preview-phone" style={{
        position: 'absolute',
        right: -6,
        bottom: -34,
        width: 116,
        background: color.ink,
        borderRadius: 20,
        padding: 5,
        boxShadow: shadow.lg,
      }}>
        <div style={{
          background: color.surface,
          borderRadius: 16,
          padding: '14px 10px 12px',
          textAlign: 'center',
        }}>
          <div style={{ ...eyebrow, fontSize: 8, marginBottom: 2 }}>Your turn</div>
          <div style={{ ...tabularNums, fontSize: 30, fontWeight: 800, color: color.ink, lineHeight: 1.1 }}>17</div>
          <div style={{
            marginTop: 6, fontSize: 9, fontWeight: 700, color: color.brandText,
            background: color.brandSoft, borderRadius: radius.pill, padding: '3px 6px',
          }}>
            3 ahead of you
          </div>
        </div>
      </div>
    </div>
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
        width: 32, height: 32, borderRadius: 9,
        background: color.brand,
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

export default function LandingPage({ onGetStarted, onSignIn, onGoHome, onNavigate }) {
  const footerLink = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: color.muted, fontSize: size.sm, fontFamily: font.sans, textAlign: 'left',
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

      {/* ── Hero ── */}
      <Section style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: space[12],
          alignItems: 'center',
        }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: color.brandSoft, border: `1px solid ${color.brandSoftBorder}`,
              color: color.brandText, padding: '6px 13px', borderRadius: radius.pill,
              fontSize: size.xs, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', marginBottom: space[5],
            }}>
              <IconQr size={13} />
              Live token display for clinics
            </div>

            <h1 style={h1}>
              Stop the crowd
              <br />
              at your counter.
            </h1>

            <p style={{ ...lead, marginTop: space[5], maxWidth: 480 }}>
              Put your live token number on any TV or phone. Patients scan once and
              watch their turn from wherever they are — the corridor, the car, the
              chai shop next door.
            </p>

            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginTop: space[8] }}>
              <button onClick={onGetStarted} className="lq-cta-btn" style={{ ...btnPrimary, padding: '15px 26px' }}>
                Create your free desk
                <IconArrowRight size={17} />
              </button>
              <a href={WHATSAPP} target="_blank" rel="noreferrer" className="lq-cta-btn" style={{ ...btnSecondary, padding: '15px 22px' }}>
                Ask on WhatsApp
              </a>
            </div>

            <ul style={{
              listStyle: 'none', padding: 0, margin: `${space[6]}px 0 0`,
              display: 'flex', flexWrap: 'wrap', gap: `${space[2]}px ${space[5]}px`,
              fontSize: size.sm, color: color.muted, fontWeight: 550,
            }}>
              {['1,500 calls free', 'No card needed', 'Running in 2 minutes'].map((t) => (
                <li key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: color.positive, display: 'inline-flex' }}><IconCheck size={15} /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ paddingBottom: space[8], position: 'relative' }}>
            {/* Soft crimson wash so the preview sits on something instead of floating */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute', inset: '-8% -4% 6%',
                background: 'radial-gradient(circle at 60% 45%, rgba(224,11,65,0.10), rgba(224,11,65,0) 68%)',
                pointerEvents: 'none',
              }}
            />
            <ProductPreview />
          </div>
        </div>
      </Section>

      {/* ── Features ── */}
      <Section tint={color.page} style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{ maxWidth: 620, marginBottom: space[10] }}>
          <div style={{ ...eyebrow, marginBottom: space[3] }}>Why clinics switch</div>
          <h2 style={h2}>Everything a token machine does, without the token machine.</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(288px, 1fr))', gap: space[5] }}>
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} style={{ ...panel, padding: space[6] }}>
              <span style={{
                width: 40, height: 40, borderRadius: radius.sm,
                background: color.brandSoft, color: color.brandText,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: space[4],
              }}>
                <Icon size={21} />
              </span>
              <h3 style={{ ...h3, marginBottom: space[2] }}>{title}</h3>
              <p style={{ ...body, fontSize: size.base, color: color.muted }}>{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── How it works ── */}
      <Section style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{ maxWidth: 620, marginBottom: space[10] }}>
          <div style={{ ...eyebrow, marginBottom: space[3] }}>Setup</div>
          <h2 style={h2}>Three steps, done in your browser.</h2>
          <p style={{ ...lead, marginTop: space[3] }}>Nothing to install, nothing to configure.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: space[6] }}>
          {STEPS.map(({ n, title, desc }) => (
            <div key={n}>
              <div style={{
                width: 38, height: 38, borderRadius: radius.pill,
                background: color.ink, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: size.md, fontWeight: 700, marginBottom: space[4],
                ...tabularNums,
              }}>
                {n}
              </div>
              <h3 style={{ ...h3, marginBottom: space[2] }}>{title}</h3>
              <p style={{ ...body, color: color.muted }}>{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Pricing ── */}
      <Section tint={color.page} style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{ maxWidth: 640, marginBottom: space[10] }}>
          <div style={{ ...eyebrow, marginBottom: space[3] }}>Pricing</div>
          <h2 style={h2}>You pay per patient called. That’s it.</h2>
          <p style={{ ...lead, marginTop: space[3] }}>
            One call is one tap of “+1 Next Token”. No subscription, no setup fee, and
            your balance never expires.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: space[5] }}>
          {PACKS.map((p) => (
            <div
              key={p.name}
              style={{
                ...panel,
                padding: space[6],
                borderColor: p.featured ? color.brandSoftBorder : color.line,
                boxShadow: p.featured ? shadow.md : shadow.sm,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {p.featured && (
                <span style={{
                  position: 'absolute', top: space[6], right: space[6],
                  background: color.brandSoft, color: color.brandText,
                  border: `1px solid ${color.brandSoftBorder}`,
                  borderRadius: radius.pill, padding: '3px 10px',
                  fontSize: 10, fontWeight: 750, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Popular
                </span>
              )}
              <div style={{ ...eyebrow, marginBottom: space[3] }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: size['3xl'], fontWeight: 800, color: color.ink, letterSpacing: '-0.03em', ...tabularNums }}>
                  ₹{p.price}
                </span>
                <span style={{ fontSize: size.sm, color: color.faint, fontWeight: 600 }}>one-time</span>
              </div>
              <div style={{ fontSize: size.md, fontWeight: 700, color: color.brandText, marginTop: space[2] }}>
                {p.tokens} calls
              </div>
              <div style={{ fontSize: size.sm, color: color.faint, marginTop: 2 }}>{p.per}</div>
              <p style={{ ...body, color: color.muted, marginTop: space[4], flex: 1 }}>{p.note}</p>
            </div>
          ))}
        </div>

        <div style={{
          ...panel,
          marginTop: space[6],
          padding: `${space[5]}px ${space[6]}px`,
          display: 'flex', alignItems: 'center', gap: space[4], flexWrap: 'wrap',
          background: color.surface,
        }}>
          <span style={{ color: color.positive, display: 'inline-flex' }}><IconShield size={20} /></span>
          <p style={{ ...body, margin: 0, flex: 1, minWidth: 220 }}>
            <strong style={{ color: color.ink, fontWeight: 700 }}>Start free.</strong>{' '}
            Every new desk gets 1,500 calls — enough to run a full OP desk for weeks before
            you decide whether to pay anything.
          </p>
          <button onClick={onGetStarted} style={{ ...btnPrimary, padding: '12px 20px', fontSize: size.base }}>
            Start for free
          </button>
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section style={{ paddingTop: space[16], paddingBottom: space[16] }}>
        <div style={{ maxWidth: 620, marginBottom: space[8] }}>
          <div style={{ ...eyebrow, marginBottom: space[3] }}>Questions</div>
          <h2 style={h2}>Before you sign up.</h2>
        </div>

        <div style={{ maxWidth: 760, display: 'grid', gap: space[3] }}>
          {FAQS.map(({ q, a }) => (
            <details
              key={q}
              style={{
                ...panel,
                padding: `${space[4]}px ${space[5]}px`,
                boxShadow: 'none',
                background: color.raised,
              }}
            >
              <summary style={{
                cursor: 'pointer', listStyle: 'none',
                fontSize: size.md, fontWeight: 650, color: color.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[4],
              }}>
                {q}
                <span style={{ color: color.faint, flexShrink: 0, fontSize: 18, lineHeight: 1 }} aria-hidden="true">+</span>
              </summary>
              <p style={{ ...body, color: color.muted, marginTop: space[3] }}>{a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ── Closing CTA ── */}
      <Section style={{ paddingBottom: space[16] }}>
        <div style={{
          background: color.ink,
          borderRadius: radius.xl,
          padding: `${space[12]}px ${space[8]}px`,
          textAlign: 'center',
        }}>
          <h2 style={{ ...h2, color: '#fff' }}>Set your desk up before the next OP.</h2>
          <p style={{ ...lead, color: 'rgba(255,255,255,0.72)', marginTop: space[4], maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            It takes about two minutes and costs nothing to try.
          </p>
          <div style={{ display: 'flex', gap: space[3], justifyContent: 'center', flexWrap: 'wrap', marginTop: space[8] }}>
            <button onClick={onGetStarted} style={{ ...btnPrimary, padding: '15px 28px' }}>
              Create your free desk
              <IconArrowRight size={17} />
            </button>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              style={{
                ...btnSecondary,
                padding: '15px 22px',
                background: 'transparent',
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.28)',
                boxShadow: 'none',
              }}
            >
              Talk to us
              <IconExternal size={16} />
            </a>
          </div>
        </div>
      </Section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: `1px solid ${color.line}`,
        background: color.page,
        padding: `${space[10]}px 20px ${space[8]}px`,
        marginTop: 'auto',
      }}>
        <div style={{
          maxWidth: 1080, margin: '0 auto', width: '100%', boxSizing: 'border-box',
          display: 'flex', flexWrap: 'wrap', gap: space[8], justifyContent: 'space-between',
        }}>
          <div style={{ maxWidth: 300 }}>
            <Logo onClick={onGoHome} />
            <p style={{ ...body, fontSize: size.sm, color: color.muted, marginTop: space[3] }}>
              Live token displays for clinics and consultation desks across India.
            </p>
          </div>

          <nav aria-label="Footer" style={{ display: 'flex', gap: space[10], flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...eyebrow, fontSize: 11, marginBottom: space[3] }}>Product</div>
              <div style={{ display: 'grid', gap: space[2] }}>
                <button onClick={onGetStarted} style={footerLink}>Create a desk</button>
                <button onClick={onSignIn} style={footerLink}>Sign in</button>
                <a href={WHATSAPP} target="_blank" rel="noreferrer" style={{ ...footerLink, textDecoration: 'none' }}>
                  WhatsApp
                </a>
              </div>
            </div>
            <div>
              <div style={{ ...eyebrow, fontSize: 11, marginBottom: space[3] }}>Legal</div>
              <div style={{ display: 'grid', gap: space[2] }}>
                <button onClick={() => onNavigate('contact')} style={footerLink}>Contact Us</button>
                <button onClick={() => onNavigate('privacy')} style={footerLink}>Privacy Policy</button>
                <button onClick={() => onNavigate('terms')} style={footerLink}>Terms of Service</button>
                <button onClick={() => onNavigate('refunds')} style={footerLink}>Refund Policy</button>
              </div>
            </div>
          </nav>
        </div>

        <div style={{
          maxWidth: 1080, margin: `${space[8]}px auto 0`, paddingTop: space[5],
          borderTop: `1px solid ${color.line}`, width: '100%', boxSizing: 'border-box',
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: space[3],
          fontSize: size.sm, color: color.faint,
        }}>
          <span>© {new Date().getFullYear()} LiveQueue. All rights reserved.</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconClock size={14} />
            Built for Indian clinics
          </span>
        </div>
      </footer>
    </div>
  );
}

import React from 'react';
import { supabase } from './supabaseClient';
import { color, size, radius, space, panel, h2, body, eyebrow, btnSecondary, tabularNums } from './lib/theme';

/**
 * Owner-only dashboard at /dev.
 *
 * Everything here is READ ONLY: it calls one SQL function, dev_stats(), and
 * draws the result. The gate is in the database — dev_stats() refuses any
 * caller whose signed-in email is not in app_admins — so hiding this route in
 * React is only tidiness, not the security.
 */

// A state is never colour alone: every chip carries its own word.
const STATE = {
  active:       { label: 'Active',        hint: 'called a token in the last 7 days',  fg: '#13693C', bg: '#E7F7EE', bd: '#BCE6CF' },
  slipping:     { label: 'Slipping',      hint: 'last call 8–30 days ago',            fg: '#8A5A00', bg: '#FFF6E5', bd: '#F2DFB5' },
  dormant:      { label: 'Dormant',       hint: 'silent for over 30 days',            fg: '#8C1D2B', bg: '#FDEBEE', bd: '#F3C7CF' },
  never_called: { label: 'Never called',  hint: 'signed up, never called a token',    fg: '#3A4252', bg: '#EFF2F7', bd: '#D9DFE9' },
  unconfirmed:  { label: 'Unconfirmed',   hint: 'never clicked the email link',       fg: '#3A4252', bg: '#EFF2F7', bd: '#D9DFE9' },
};

const nf = (n) => Number(n || 0).toLocaleString('en-IN');

function ago(iso) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

function Tile({ label, value, note, accent }) {
  return (
    <div style={{ ...panel, padding: space[5] }}>
      <div style={{ ...eyebrow, fontSize: 11, marginBottom: space[2] }}>{label}</div>
      <div style={{
        ...tabularNums, fontSize: 38, lineHeight: 1, fontWeight: 800,
        letterSpacing: '-0.03em', color: accent || color.ink,
      }}>
        {value}
      </div>
      {note ? (
        <div style={{ fontSize: size.sm, color: color.muted, marginTop: space[2] }}>{note}</div>
      ) : null}
    </div>
  );
}

function Chip({ state }) {
  const s = STATE[state] || STATE.never_called;
  return (
    <span title={s.hint} style={{
      display: 'inline-block', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      color: s.fg, background: s.bg, border: `1px solid ${s.bd}`,
      borderRadius: radius.pill, padding: '3px 10px',
    }}>
      {s.label}
    </span>
  );
}

export default function DevDashboard({ onGoHome }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: stats, error: err } = await supabase.rpc('dev_stats');
    if (err) {
      setError(
        err.code === '42501' || /not authoris/i.test(err.message || '')
          ? 'This page is only for the LiveQueue owner. Sign in with the owner account to see it.'
          : (err.message || 'Could not load the numbers.'),
      );
      setData(null);
    } else {
      setData(stats);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const t = data?.totals || {};
  const clinics = data?.clinics || [];

  const th = {
    textAlign: 'left', fontSize: 11, fontWeight: 750, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: color.faint, padding: `0 ${space[3]}px ${space[2]}px`,
    whiteSpace: 'nowrap',
  };
  const td = {
    padding: `${space[3]}px ${space[3]}px`, fontSize: size.sm, color: color.body,
    borderTop: `1px solid ${color.line}`, verticalAlign: 'middle', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ minHeight: '100vh', background: color.page, padding: `${space[8]}px 20px ${space[16]}px` }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space[4], flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...eyebrow, marginBottom: space[2] }}>Owner view</div>
            <h1 style={{ ...h2, marginBottom: space[1] }}>How LiveQueue is being used</h1>
            <p style={{ ...body, color: color.muted }}>
              Read-only. “Active” means the clinic called a token in the last 7 days.
            </p>
          </div>
          <div style={{ display: 'flex', gap: space[3] }}>
            <button onClick={load} style={{ ...btnSecondary, padding: '10px 18px' }} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button onClick={onGoHome} style={{ ...btnSecondary, padding: '10px 18px' }}>Home</button>
          </div>
        </div>

        {error ? (
          <div style={{
            ...panel, padding: space[6], marginTop: space[8],
            borderColor: color.brandSoftBorder, background: color.brandSoft, color: color.brandText,
            fontSize: size.base, fontWeight: 600,
          }}>
            {error}
          </div>
        ) : null}

        {data ? (
          <>
            <div style={{
              display: 'grid', gap: space[4], marginTop: space[8],
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            }}>
              <Tile label="Signed up" value={nf(t.signups)} note={`${nf(t.signups_7d)} in the last 7 days`} />
              <Tile label="Active now" value={nf(t.active)} accent={color.brand} note="called a token this week" />
              <Tile label="Slipping" value={nf(t.slipping)} note="8–30 days quiet" />
              <Tile label="Dormant" value={nf(t.dormant)} note="over 30 days quiet" />
              <Tile label="Never started" value={nf((t.unconfirmed || 0) + (t.never_called || 0))}
                    note={`${nf(t.unconfirmed)} never confirmed email`} />
              <Tile label="Tokens called" value={nf(t.calls_total)} note="across every desk, all time" />
              <Tile label="Paying clinics" value={nf(t.paying)} note={`₹${nf(t.rupees_total)} received`} />
              <Tile label="Desks created" value={nf(t.desks)} note={`${nf(t.unnamed_desks)} still unnamed`} />
            </div>

            <div style={{ ...panel, padding: space[5], marginTop: space[8], overflowX: 'auto' }}>
              <h2 style={{ fontSize: size.lg, fontWeight: 700, color: color.ink, marginBottom: space[4] }}>
                Every account
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={th}>State</th>
                    <th style={th}>Email</th>
                    <th style={th}>Desk</th>
                    <th style={th}>Link</th>
                    <th style={{ ...th, textAlign: 'right' }}>Calls</th>
                    <th style={{ ...th, textAlign: 'right' }}>Left</th>
                    <th style={th}>Last call</th>
                    <th style={th}>Signed up</th>
                  </tr>
                </thead>
                <tbody>
                  {clinics.map((c) => (
                    <tr key={c.email}>
                      <td style={td}><Chip state={c.state} /></td>
                      <td style={{ ...td, color: color.ink, fontWeight: 600 }}>{c.email}</td>
                      <td style={td}>{c.queue_title || '—'}</td>
                      <td style={td}>
                        {c.slug ? (
                          <a href={`/${c.slug}`} target="_blank" rel="noreferrer" style={{ color: color.brandText }}>
                            /{c.slug}
                          </a>
                        ) : '—'}
                      </td>
                      <td style={{ ...td, ...tabularNums, textAlign: 'right' }}>{nf(c.calls_used)}</td>
                      <td style={{ ...td, ...tabularNums, textAlign: 'right', color: color.muted }}>
                        {c.remaining_tokens == null ? '—' : nf(c.remaining_tokens)}
                      </td>
                      <td style={td} title={c.last_call_at || ''}>{ago(c.last_call_at)}</td>
                      <td style={{ ...td, color: color.muted }} title={c.signed_up || ''}>{ago(c.signed_up)}</td>
                    </tr>
                  ))}
                  {clinics.length === 0 ? (
                    <tr><td style={{ ...td, color: color.muted }} colSpan={8}>No accounts yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: size.sm, color: color.faint, marginTop: space[5] }}>
              Updated {data.generated_at ? new Date(data.generated_at).toLocaleString('en-IN') : 'just now'}.
              Calls are counted from the free 1,500 plus anything bought, so the number is lifetime usage per desk.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

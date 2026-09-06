import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentPage, setCurrentPage] = useState('home'); // 'home' | 'admin_login' | 'status' | 'admin_dash'
  
  // Public search & status state
  const [inputQuery, setInputQuery] = useState('');
  const [activeQueue, setActiveQueue] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const prevPosRef = useRef(null);

  // Admin Auth & Queue state
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  
  const [queue, setQueue] = useState(null);
  const [remainingTokens, setRemainingTokens] = useState(1500);
  const [accountStatus, setAccountStatus] = useState('Active');
  const [adminError, setAdminError] = useState('');

  // Admin Edit Counter state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editSlug, setEditSlug] = useState('');

  // Synthetic Audio Chime
  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (err) {
      console.warn('Audio click required:', err);
    }
  };

  const getRouteSlug = () => {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (path && path !== '' && path !== 'index.html') {
      return decodeURIComponent(path).toLowerCase();
    }
    return null;
  };

  useEffect(() => {
    const slug = getRouteSlug();
    if (slug) {
      setCurrentPage('status');
      fetchQueueBySlug(slug);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session && !getRouteSlug()) {
        setCurrentPage('admin_dash');
        fetchAdminData(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session && !getRouteSlug()) {
        setCurrentPage('admin_dash');
        fetchAdminData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (currentPage !== 'status' || !activeQueue?.queue_id) return;

    const channel = supabase
      .channel(`public_room_${activeQueue.queue_id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'queue_details', filter: `queue_id=eq.${activeQueue.queue_id}` },
        (payload) => {
          const row = payload.new;
          if (prevPosRef.current !== null && row.queue_position > prevPosRef.current) {
            playAlertSound();
          }
          prevPosRef.current = row.queue_position;
          setActiveQueue(row);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [currentPage, activeQueue?.queue_id]);

  async function fetchQueueBySlug(slug) {
    setLookupError('');
    const { data, error } = await supabase
      .from('queue_details')
      .select('*')
      .eq('slug', slug.toLowerCase())
      .maybeSingle();

    if (error || !data) {
      setLookupError(`Queue "/${slug}" not found.`);
      setActiveQueue(null);
    } else {
      prevPosRef.current = data.queue_position;
      setActiveQueue(data);
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    const cleanSlug = inputQuery.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    if (!cleanSlug) return;
    window.history.pushState({}, '', `/${cleanSlug}`);
    setCurrentPage('status');
    fetchQueueBySlug(cleanSlug);
  }

  async function fetchAdminData(adminId) {
    setAdminError('');

    const { data: adminData } = await supabase
      .from('admin')
      .select('status, valid_until')
      .eq('admin_id', adminId)
      .single();
    if (adminData) setAccountStatus(adminData.status);

    const { data: usageData } = await supabase
      .from('usage')
      .select('remaining_tokens')
      .eq('admin_id', adminId)
      .single();
    if (usageData) setRemainingTokens(usageData.remaining_tokens);

    const { data: queueList } = await supabase
      .from('queue_details')
      .select('*')
      .eq('admin_id', adminId)
      .order('queue_id', { ascending: true });

    if (queueList && queueList.length > 0) {
      const q = queueList[0];
      setQueue(q);
      setEditTitle(q.queue_title);
      setEditSubtitle(q.queue_subtitle);
      setEditSlug(q.slug || '');
    } else {
      const defaultSlug = `desk-${Math.floor(1000 + Math.random() * 9000)}`;
      const { data: newQueue } = await supabase
        .from('queue_details')
        .insert([{
          admin_id: adminId,
          queue_title: 'Counter 1',
          queue_subtitle: 'Consultation Desk',
          slug: defaultSlug,
          queue_position: 0
        }])
        .select()
        .single();
      setQueue(newQueue);
      setEditTitle('Counter 1');
      setEditSubtitle('Consultation Desk');
      setEditSlug(defaultSlug);
    }
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) setAuthError(error.message);
    else setOtpSent(true);
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setLoading(false);
    if (error) setAuthError(error.message);
  }

  async function advanceQueue() {
    if (!queue) return;
    setAdminError('');
    const nextPos = queue.queue_position + 1;

    const { error } = await supabase
      .from('queue_details')
      .update({ queue_position: nextPos, updated_at: new Date().toISOString() })
      .eq('queue_id', queue.queue_id);

    if (error) {
      setAdminError(error.message);
    } else {
      setQueue({ ...queue, queue_position: nextPos });
      setRemainingTokens(prev => Math.max(0, prev - 1));
    }
  }

  async function previousQueue() {
    if (!queue || queue.queue_position <= 0) return;
    setAdminError('');
    const prevPos = queue.queue_position - 1;

    const { error } = await supabase
      .from('queue_details')
      .update({ queue_position: prevPos, updated_at: new Date().toISOString() })
      .eq('queue_id', queue.queue_id);

    if (error) {
      setAdminError(error.message);
    } else {
      setQueue({ ...queue, queue_position: prevPos });
    }
  }

  async function resetQueue() {
    if (!queue || !window.confirm('Reset queue back to 0?')) return;
    const { error } = await supabase
      .from('queue_details')
      .update({ queue_position: 0, updated_at: new Date().toISOString() })
      .eq('queue_id', queue.queue_id);

    if (error) setAdminError(error.message);
    else setQueue({ ...queue, queue_position: 0 });
  }

  async function saveDetails(e) {
    e.preventDefault();
    setAdminError('');
    
    const cleanSlug = editSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!cleanSlug) {
      setAdminError('Slug cannot be empty.');
      return;
    }

    if (/^\d+$/.test(cleanSlug)) {
      setAdminError('Slug cannot be only numbers. Please use letters (e.g. clinic-1, dr-latheef).');
      return;
    }

    const { error } = await supabase
      .from('queue_details')
      .update({
        queue_title: editTitle,
        queue_subtitle: editSubtitle,
        slug: cleanSlug
      })
      .eq('queue_id', queue.queue_id);

    if (error) {
      if (error.code === '23505') {
        setAdminError('This custom URL slug is already taken. Please choose another.');
      } else {
        setAdminError(error.message);
      }
    } else {
      setQueue({ ...queue, queue_title: editTitle, queue_subtitle: editSubtitle, slug: cleanSlug });
      setEditSlug(cleanSlug);
      setIsEditing(false);
    }
  }

  const isBlocked = accountStatus === 'Block' || remainingTokens <= 0;
  const currentPublicLink = queue?.slug ? `${window.location.origin}/${queue.slug}` : '';

  // ══════════════════════════════════════════════════════════
  // VIEW 1: PUBLIC / TV DISPLAY (High-Contrast White Typography)
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'status') {
    return (
      <div 
        onClick={playAlertSound}
        style={{
          minHeight: '100vh',
          backgroundColor: '#0c0f14',
          backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(255, 56, 92, 0.15), rgba(255, 255, 255, 0))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#ffffff',
          textAlign: 'center',
          padding: 32,
          position: 'relative'
        }}
      >
        <button
          onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage(session ? 'admin_dash' : 'home');
          }}
          style={{
            position: 'absolute',
            top: 28,
            left: 28,
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            color: '#f1f5f9',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '10px 20px',
            borderRadius: 999,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500
          }}
        >
          {session ? '← Back to Controller' : '← Find Another Desk'}
        </button>

        {activeQueue ? (
          <div style={{ maxWidth: 840, width: '100%' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              borderRadius: 999,
              background: 'rgba(255, 56, 92, 0.12)',
              border: '1px solid rgba(255, 56, 92, 0.25)',
              color: '#FF385C',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 20
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#FF385C', display: 'inline-block', boxShadow: '0 0 10px #FF385C' }} />
              Live Calling
            </div>

            <h1 style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              fontWeight: 800,
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: '#ffffff'
            }}>
              {activeQueue.queue_title}
            </h1>
            <p style={{
              fontSize: '1.25rem',
              color: '#cbd5e1',
              margin: '0 0 48px',
              fontWeight: 500
            }}>
              {activeQueue.queue_subtitle}
            </p>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 36,
              padding: '48px 24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(20px)'
            }}>
              <span style={{ fontSize: 16, letterSpacing: 4, textTransform: 'uppercase', color: '#cbd5e1', fontWeight: 600 }}>
                Now Serving
              </span>
              <div style={{
                fontSize: 'clamp(8rem, 22vw, 15rem)',
                fontWeight: 900,
                lineHeight: 1.1,
                margin: '16px 0',
                letterSpacing: '-0.03em',
                background: 'linear-gradient(180deg, #ffffff 60%, #94a3b8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {activeQueue.queue_position === 0 ? '—' : activeQueue.queue_position}
              </div>
            </div>

            <p style={{ color: '#64748b', marginTop: 32, fontSize: 13, fontWeight: 500 }}>
              Click anywhere once to enable audio chime alerts • Synced in real-time
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 400, textAlign: 'center' }}>
            <p style={{ color: '#FF385C', fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
              {lookupError || 'Loading live display...'}
            </p>
            {lookupError && (
              <button
                onClick={() => {
                  window.history.replaceState({}, '', '/');
                  setCurrentPage('home');
                }}
                style={{
                  background: '#FF385C',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 28px',
                  borderRadius: 999,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Go Back to Search
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 2: PUBLIC HOME (Centered Minimalist Pill)
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'home') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', display: 'flex', flexDirection: 'column' }}>
        
        {/* Navigation Bar */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 40px', borderBottom: '1px solid #ebebeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setCurrentPage('home')}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #FF385C 0%, #E00B41 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(255, 56, 92, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
                <line x1="7" y1="16" x2="10" y2="16" />
              </svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#222222' }}>
              live<span style={{ color: '#FF385C' }}>queue</span>
            </span>
          </div>

          <div>
            {session ? (
              <button
                onClick={() => setCurrentPage('admin_dash')}
                style={{
                  background: '#222222',
                  color: '#ffffff',
                  border: 'none',
                  padding: '11px 22px',
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Open Dashboard
              </button>
            ) : (
              <button
                onClick={() => setCurrentPage('admin_login')}
                style={{
                  background: 'transparent',
                  color: '#222222',
                  border: '1px solid #dddddd',
                  padding: '10px 20px',
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Host / Admin Login
              </button>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px 80px' }}>
          <div style={{ textAlign: 'center', maxWidth: 680, marginBottom: 44 }}>
            <h1 style={{ fontSize: 'clamp(2.4rem, 4.5vw, 3.6rem)', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.15, color: '#222222' }}>
              Track any queue,<br />live in real-time.
            </h1>
            <p style={{ fontSize: 17, color: '#717171', margin: 0, fontWeight: 400, lineHeight: 1.5 }}>
              Enter the custom counter link provided by your clinic, desk, or business.
            </p>
          </div>

          {/* Centered Search Pill */}
          <div style={{ width: '100%', maxWidth: 540 }}>
            <form
              onSubmit={handleSearchSubmit}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#ffffff',
                border: '1px solid #dddddd',
                borderRadius: 999,
                padding: '6px 6px 6px 24px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <span style={{ color: '#94a3b8', fontSize: 18, fontWeight: 500, marginRight: 2, userSelect: 'none' }}>/</span>
                <input
                  type="text"
                  required
                  placeholder="dr-adam or room-1"
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    fontSize: 16,
                    color: '#222222',
                    background: 'transparent',
                    fontWeight: 500,
                    width: '100%',
                    padding: 0,
                    lineHeight: 'normal'
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 999,
                  height: 48,
                  padding: '0 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(255, 56, 92, 0.3)'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Search
              </button>
            </form>

            {lookupError && (
              <div style={{ marginTop: 16, textAlign: 'center', color: '#c13515', fontSize: 14, fontWeight: 500 }}>
                {lookupError}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 3: ADMIN LOGIN
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'admin_login' && !session) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: 24 }}>
        <div style={{
          maxWidth: 420,
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: 24,
          boxShadow: '0 12px 36px rgba(0,0,0,0.08)',
          border: '1px solid #ebebeb',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #ebebeb' }}>
            <button
              onClick={() => setCurrentPage('home')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#222" fill="none">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15, marginRight: 24 }}>
              Sign In to Controller
            </div>
          </div>

          <div style={{ padding: '28px 24px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Welcome Host</h2>
            <p style={{ color: '#717171', fontSize: 14, margin: '0 0 24px', lineHeight: 1.4 }}>Manage your counter display and stream live tokens.</p>

            {authError && (
              <div style={{ backgroundColor: '#fff8f6', color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 20 }}>
                {authError}
              </div>
            )}

            {!otpSent ? (
              <form onSubmit={handleSendOtp}>
                <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ width: '100%', border: 'none', outline: 'none', fontSize: 16, color: '#222222', padding: 0 }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: 14,
                    background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer'
                  }}
                >
                  {loading ? 'Sending verification...' : 'Continue with Email'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>6-Digit OTP</label>
                  <input
                    type="text"
                    required
                    placeholder="• • • • • •"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    style={{ width: '100%', border: 'none', outline: 'none', fontSize: 20, textAlign: 'center', letterSpacing: 8, fontWeight: 700, color: '#222222' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: 14,
                    backgroundColor: '#222222',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer'
                  }}
                >
                  {loading ? 'Verifying...' : 'Verify & Enter'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 4: ADMIN CONTROLLER DASHBOARD
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', padding: '0 20px 60px' }}>
      
      {/* Host Bar */}
      <header style={{ maxWidth: 520, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72, borderBottom: '1px solid #ebebeb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: '#FF385C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#222222' }}>Desk Manager</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{ background: '#ffffff', border: '1px solid #dddddd', padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Home
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              setCurrentPage('home');
            }}
            style={{ background: 'transparent', border: 'none', color: '#717171', padding: '8px 10px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Log out
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 480, margin: '24px auto 0' }}>
        
        {/* Token Balance Widget */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          padding: '18px 24px',
          border: '1px solid #ebebeb',
          boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#222222' }}>Remaining Balance</div>
            <div style={{ fontSize: 12, color: '#717171' }}>Available calls in your quota</div>
          </div>
          <div style={{
            fontSize: 20,
            fontWeight: 800,
            color: remainingTokens <= 100 ? '#c13515' : '#008a05',
            backgroundColor: remainingTokens <= 100 ? '#fff8f6' : '#f0fdf4',
            padding: '6px 14px',
            borderRadius: 999
          }}>
            {remainingTokens}
          </div>
        </div>

        {adminError && (
          <div style={{ backgroundColor: '#fff8f6', color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 14, fontSize: 13, marginBottom: 16 }}>
            {adminError}
          </div>
        )}

        {/* Counter Action Card */}
        {queue && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: 32,
            border: '1px solid #ebebeb',
            boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
            textAlign: 'center',
            marginBottom: 16
          }}>
            {isEditing ? (
              <form onSubmit={saveDetails} style={{ textAlign: 'left', marginBottom: 20 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#717171', display: 'block', marginBottom: 4 }}>Counter Name</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid #b0b0b0', borderRadius: 10, fontSize: 14 }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#717171', display: 'block', marginBottom: 4 }}>Subtitle / Room</label>
                  <input
                    type="text"
                    value={editSubtitle}
                    onChange={e => setEditSubtitle(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid #b0b0b0', borderRadius: 10, fontSize: 14 }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#717171', display: 'block', marginBottom: 4 }}>Custom URL Slug</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #b0b0b0', borderRadius: 10, padding: '0 12px' }}>
                    <span style={{ color: '#717171', fontSize: 14 }}>/</span>
                    <input
                      type="text"
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value)}
                      style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 6px', fontSize: 14 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    style={{ flex: 1, padding: 11, background: '#222222', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    style={{ padding: '11px 18px', background: '#f7f7f7', border: '1px solid #dddddd', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#222222' }}>
                  {queue.queue_title}
                </h2>
                <div style={{ color: '#717171', fontSize: 14, marginBottom: 8 }}>
                  {queue.queue_subtitle}
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  style={{ background: 'none', border: 'none', color: '#FF385C', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Edit details & slug
                </button>
              </div>
            )}

            {/* Token Big Number */}
            <div style={{ padding: '24px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', margin: '16px 0 24px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#717171' }}>
                Current Token
              </span>
              <div style={{ fontSize: '5.5rem', fontWeight: 900, lineHeight: 1.1, margin: '8px 0 0', color: '#222222', letterSpacing: '-0.03em' }}>
                {queue.queue_position === 0 ? '—' : queue.queue_position}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <button
                onClick={previousQueue}
                disabled={!queue || queue.queue_position <= 0}
                style={{
                  flex: 1,
                  padding: 16,
                  fontSize: 15,
                  fontWeight: 600,
                  backgroundColor: !queue || queue.queue_position <= 0 ? '#f7f7f7' : '#ffffff',
                  color: !queue || queue.queue_position <= 0 ? '#c7c7c7' : '#222222',
                  border: '1px solid #dddddd',
                  borderRadius: 14,
                  cursor: !queue || queue.queue_position <= 0 ? 'not-allowed' : 'pointer'
                }}
              >
                -1 Previous
              </button>

              <button
                onClick={advanceQueue}
                disabled={isBlocked}
                style={{
                  flex: 2,
                  padding: 16,
                  fontSize: 16,
                  fontWeight: 700,
                  background: isBlocked ? '#e2e8f0' : 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)',
                  color: isBlocked ? '#94a3b8' : '#ffffff',
                  border: 'none',
                  borderRadius: 14,
                  cursor: isBlocked ? 'not-allowed' : 'pointer',
                  boxShadow: isBlocked ? 'none' : '0 4px 14px rgba(255, 56, 92, 0.3)'
                }}
              >
                {isBlocked ? 'Quota Exhausted' : '+1 Next Token'}
              </button>
            </div>

            <button
              onClick={resetQueue}
              style={{ background: 'none', border: 'none', color: '#717171', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Reset count back to 0
            </button>
          </div>
        )}

        {/* Share & Visitor Link Card */}
        {queue && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: 24,
            border: '1px solid #ebebeb',
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#717171' }}>
              Public Display Link
            </span>
            <div style={{ margin: '6px 0 16px', fontSize: 16, fontWeight: 700 }}>
              <a href={currentPublicLink} target="_blank" rel="noreferrer" style={{ color: '#FF385C', textDecoration: 'none' }}>
                {currentPublicLink.replace(/^https?:\/\//, '')}
              </a>
            </div>

            <div style={{ display: 'inline-block', padding: 16, backgroundColor: '#ffffff', border: '1px solid #ebebeb', borderRadius: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <QRCodeSVG value={currentPublicLink} size={140} fgColor="#222222" />
            </div>

            <div style={{ marginTop: 16 }}>
              <a
                href={currentPublicLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  background: '#222222',
                  color: '#ffffff',
                  padding: '10px 20px',
                  borderRadius: 999,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600
                }}
              >
                Launch TV Display Screen ↗
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { loadRazorpayScript } from './razorpay';

const TOKEN_PACKS = [
  { id: 'pack_500', name: 'Starter', tokens: 500, price: 99, tag: null },
  { id: 'pack_1500', name: 'Standard', tokens: 1500, price: 249, tag: 'Popular' },
  { id: 'pack_5000', name: 'Pro', tokens: 5000, price: 699, tag: 'Best Value' },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [currentPage, setCurrentPage] = useState('home'); // 'home' | 'admin_login' | 'status' | 'admin_dash' | 'reset_password'
  
  // Public search & status state
  const [inputQuery, setInputQuery] = useState('');
  const [activeQueue, setActiveQueue] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const prevPosRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Admin Auth state
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [signupStep, setSignupStep] = useState('form'); // 'form' | 'link_sent'
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  
  // Single Desk & Token state
  const [queue, setQueue] = useState(null);
  const [remainingTokens, setRemainingTokens] = useState(1500);
  const [accountStatus, setAccountStatus] = useState('Active');
  const [adminError, setAdminError] = useState('');

  // Recharge modal state
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Admin Edit Counter state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editSlug, setEditSlug] = useState('');

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

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setAuthError('');
    setAuthSuccess('');
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
    setSignupStep('form');
    setForgotSubmitted(false);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setCurrentPage('reset_password');
      } else if (session && !getRouteSlug()) {
        setCurrentPage('admin_dash');
        fetchAdminData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime display sync for status screen
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
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setAdminError('');

    try {
      const { data: adminData } = await supabase
        .from('admin')
        .select('status, valid_until')
        .eq('admin_id', adminId)
        .maybeSingle();

      if (adminData) {
        setAccountStatus(adminData.status);
      } else {
        await supabase.from('admin').insert([{ admin_id: adminId, status: 'Active' }]);
        setAccountStatus('Active');
      }

      const { data: usageData } = await supabase
        .from('usage')
        .select('remaining_tokens')
        .eq('admin_id', adminId)
        .maybeSingle();

      if (usageData) {
        setRemainingTokens(usageData.remaining_tokens);
      } else {
        await supabase.from('usage').insert([{ admin_id: adminId, remaining_tokens: 1500 }]);
        setRemainingTokens(1500);
      }

      // Fetch the single queue for this admin
      const { data: queueList } = await supabase
        .from('queue_details')
        .select('*')
        .eq('admin_id', adminId)
        .order('queue_id', { ascending: true });

      if (queueList && queueList.length > 0) {
        const q = queueList[0];
        setQueue(q);
        setEditTitle(q.queue_title);
        setEditSubtitle(q.queue_subtitle || '');
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
        if (newQueue) {
          setQueue(newQueue);
          setEditTitle(newQueue.queue_title);
          setEditSubtitle(newQueue.queue_subtitle || '');
          setEditSlug(newQueue.slug || '');
        }
      }
    } finally {
      isFetchingRef.current = false;
    }
  }

  // Auth Functions
  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setAuthSuccess('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    setLoading(false);
    if (error) {
      setAuthError(error.message);
    } else if (data?.user) {
      setCurrentPage('admin_dash');
      fetchAdminData(data.user.id);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setAuthSuccess('');

    if (!fullName.trim()) {
      setAuthError('Please enter your full name.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: { name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    setLoading(false);
    if (error) {
      setAuthError(error.message);
    } else if (data?.session) {
      setCurrentPage('admin_dash');
      fetchAdminData(data.user.id);
    } else {
      setSignupStep('link_sent');
    }
  }

  async function handleResendLink() {
    setResendLoading(true);
    setAuthError('');
    setAuthSuccess('');

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/` },
    });

    setResendLoading(false);
    if (error) setAuthError(error.message);
    else setAuthSuccess('A fresh verification link has been sent to your email.');
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });

    setLoading(false);
    if (error) setAuthError(error.message);
    else setForgotSubmitted(true);
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    if (newPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthSuccess('Password updated! Redirecting...');
      setTimeout(() => setCurrentPage('admin_dash'), 700);
    }
  }

  // Queue Counter Controls
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
      const newTokens = Math.max(0, remainingTokens - 1);
      setRemainingTokens(newTokens);
      if (session?.user?.id) {
        await supabase
          .from('usage')
          .update({ remaining_tokens: newTokens })
          .eq('admin_id', session.user.id);
      }
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
    if (!queue || !window.confirm(`Reset "${queue.queue_title}" back to token 0?`)) return;
    const { error } = await supabase
      .from('queue_details')
      .update({ queue_position: 0, updated_at: new Date().toISOString() })
      .eq('queue_id', queue.queue_id);

    if (error) {
      setAdminError(error.message);
    } else {
      setQueue({ ...queue, queue_position: 0 });
    }
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
      setAdminError('Slug cannot be numbers only. Add letters.');
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
        setAdminError('This custom URL slug is already taken.');
      } else {
        setAdminError(error.message);
      }
    } else {
      setQueue({ ...queue, queue_title: editTitle, queue_subtitle: editSubtitle, slug: cleanSlug });
      setIsEditing(false);
    }
  }

  async function handleRecharge(pack) {
    setIsProcessing(true);
    setAdminError('');

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setAdminError('Razorpay failed to initialize. Check your connection.');
      setIsProcessing(false);
      return;
    }

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: pack.price * 100,
      currency: 'INR',
      name: 'LiveQueue',
      description: `Recharge ${pack.tokens.toLocaleString()} Tokens`,
      handler: async function () {
        try {
          const updatedTokens = (remainingTokens || 0) + pack.tokens;

          const { error } = await supabase
            .from('usage')
            .update({ remaining_tokens: updatedTokens })
            .eq('admin_id', session.user.id);

          if (error) throw error;

          setRemainingTokens(updatedTokens);
          setIsRechargeOpen(false);
        } catch (err) {
          console.error('Balance update failed:', err);
          setAdminError('Payment captured, but failed to credit tokens. Contact support.');
        } finally {
          setIsProcessing(false);
        }
      },
      prefill: { email: session?.user?.email || '' },
      theme: { color: '#FF385C' },
      modal: { ondismiss: () => setIsProcessing(false) },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  }

  const isBlocked = accountStatus === 'Block' || remainingTokens <= 0;
  const currentPublicLink = queue?.slug ? `${window.location.origin}/${queue.slug}` : '';

  // ══════════════════════════════════════════════════════════
  // VIEW 1: PUBLIC / TV DISPLAY
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

            <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.2, color: '#ffffff' }}>
              {activeQueue.queue_title}
            </h1>
            <p style={{ fontSize: '1.25rem', color: '#cbd5e1', margin: '0 0 48px', fontWeight: 500 }}>
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
              Click anywhere to enable audio chime alerts • Synced in real-time
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
  // VIEW 2: PUBLIC HOME
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'home') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', display: 'flex', flexDirection: 'column' }}>
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
                style={{ background: '#222222', color: '#ffffff', border: 'none', padding: '11px 22px', borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Open Dashboard
              </button>
            ) : (
              <button
                onClick={() => {
                  switchAuthMode('login');
                  setCurrentPage('admin_login');
                }}
                style={{ background: 'transparent', color: '#222222', border: '1px solid #dddddd', padding: '10px 20px', borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Host / Admin Login
              </button>
            )}
          </div>
        </header>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px 80px' }}>
          <div style={{ textAlign: 'center', maxWidth: 680, marginBottom: 44 }}>
            <h1 style={{ fontSize: 'clamp(2.4rem, 4.5vw, 3.6rem)', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.15, color: '#222222' }}>
              Track any queue,<br />live in real-time.
            </h1>
            <p style={{ fontSize: 17, color: '#717171', margin: 0, fontWeight: 400, lineHeight: 1.5 }}>
              Enter the custom counter link provided by your clinic, desk, or business.
            </p>
          </div>

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
                  style={{ border: 'none', outline: 'none', fontSize: 16, color: '#222222', background: 'transparent', fontWeight: 500, width: '100%', padding: 0 }}
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
  // VIEW 3: PASSWORD RECOVERY TARGET
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'reset_password') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%', backgroundColor: '#ffffff', borderRadius: 24, padding: 32, boxShadow: '0 12px 36px rgba(0,0,0,0.08)', border: '1px solid #ebebeb' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Set New Password</h2>
          <p style={{ color: '#717171', fontSize: 13, margin: '0 0 20px' }}>Enter your new password to regain access to your desk.</p>

          {authError && (
            <div style={{ backgroundColor: '#fff8f6', color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 16 }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleUpdatePassword}>
            <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>New Password</label>
              <input
                type="password"
                required
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
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
              {loading ? 'Saving...' : 'Update & Enter Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 4: ADMIN AUTH
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'admin_login' && !session) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%', backgroundColor: '#ffffff', borderRadius: 24, boxShadow: '0 12px 36px rgba(0,0,0,0.08)', border: '1px solid #ebebeb', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #ebebeb' }}>
            <button
              onClick={() => {
                switchAuthMode('login');
                setCurrentPage('home');
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#222" fill="none">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15, marginRight: 24 }}>
              {authMode === 'signup' ? 'Create Host Account' : authMode === 'forgot' ? 'Reset Password' : 'Sign In to Controller'}
            </div>
          </div>

          <div style={{ padding: '28px 24px' }}>
            {authMode !== 'forgot' && signupStep !== 'link_sent' && (
              <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 24 }}>
                <button
                  type="button"
                  onClick={() => switchAuthMode('login')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: authMode === 'login' ? '#ffffff' : 'transparent',
                    color: authMode === 'login' ? '#222222' : '#64748b',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchAuthMode('signup')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: authMode === 'signup' ? '#ffffff' : 'transparent',
                    color: authMode === 'signup' ? '#222222' : '#64748b',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Sign Up
                </button>
              </div>
            )}

            {authError && (
              <div style={{ backgroundColor: '#fff8f6', color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 20 }}>
                {authError}
              </div>
            )}

            {authSuccess && (
              <div style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 20 }}>
                {authSuccess}
              </div>
            )}

            {authMode === 'login' && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Welcome Host</h2>
                <p style={{ color: '#717171', fontSize: 13, margin: '0 0 20px' }}>Sign in using your registered email and password.</p>

                <form onSubmit={handleLogin}>
                  <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
                    />
                  </div>

                  <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
                    />
                  </div>

                  <div style={{ textAlign: 'right', marginBottom: 20 }}>
                    <button
                      type="button"
                      onClick={() => switchAuthMode('forgot')}
                      style={{ background: 'none', border: 'none', color: '#FF385C', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      Forgot password?
                    </button>
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
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#717171' }}>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchAuthMode('signup')}
                    style={{ background: 'none', border: 'none', color: '#FF385C', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Sign Up
                  </button>
                </div>
              </div>
            )}

            {authMode === 'signup' && (
              <div>
                {signupStep === 'form' ? (
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Create Your Desk</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 20px' }}>Register your host account with email and password.</p>

                    <form onSubmit={handleSignUp}>
                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Full Name <span style={{ color: '#FF385C' }}>*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Dr. Adam or Clinic Host"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Email Address <span style={{ color: '#FF385C' }}>*</span>
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Password <span style={{ color: '#FF385C' }}>*</span>
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="At least 6 characters"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Confirm Password <span style={{ color: '#FF385C' }}>*</span>
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="Repeat password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
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
                        {loading ? 'Sending verification link...' : 'Create Account'}
                      </button>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#717171' }}>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchAuthMode('login')}
                        style={{ background: 'none', border: 'none', color: '#FF385C', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        Sign In
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#ffeef1', color: '#FF385C', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                      </svg>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: '#222222' }}>Verification Link Sent</h2>
                    <p style={{ color: '#717171', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
                      We sent an activation link to:<br />
                      <strong style={{ color: '#222222' }}>{email}</strong>
                    </p>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, fontSize: 13, color: '#475569', lineHeight: 1.5, textAlign: 'left', marginBottom: 24 }}>
                      💡 <strong>Next step:</strong> Click the confirmation link in your inbox. Once confirmed, return here and sign in with your email and password.
                    </div>
                    <button
                      type="button"
                      onClick={() => switchAuthMode('login')}
                      style={{ width: '100%', padding: 14, background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 14 }}
                    >
                      Go to Sign In
                    </button>
                    <button
                      type="button"
                      onClick={handleResendLink}
                      disabled={resendLoading}
                      style={{ background: 'none', border: 'none', color: '#717171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {resendLoading ? 'Resending...' : "Didn't get the email? Resend link"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {authMode === 'forgot' && (
              <div>
                {!forgotSubmitted ? (
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Reset Password</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 20px' }}>Enter your email to receive a password reset link.</p>

                    <form onSubmit={handleForgotPassword}>
                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Registered Email</label>
                        <input
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', padding: 0 }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', padding: 14, background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 16 }}
                      >
                        {loading ? 'Sending link...' : 'Send Reset Link'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#f0fdf4', color: '#166534', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#222222' }}>Reset Link Sent</h2>
                    <p style={{ color: '#717171', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
                      We sent a reset link to <strong>{email}</strong>.
                    </p>
                  </div>
                )}

                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => switchAuthMode('login')}
                    style={{ background: 'none', border: 'none', color: '#717171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ← Back to Sign In
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 5: ADMIN CONTROLLER DASHBOARD (SINGLE DESK)
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
              switchAuthMode('login');
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
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <button
              onClick={() => setIsRechargeOpen(true)}
              style={{
                background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(255, 56, 92, 0.25)'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Recharge
            </button>
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

            {/* Token Big Number Display */}
            <div style={{ padding: '24px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', margin: '16px 0 24px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#717171' }}>
                Current Token
              </span>
              <div style={{ fontSize: '5.5rem', fontWeight: 900, lineHeight: 1.1, margin: '8px 0 0', color: '#222222', letterSpacing: '-0.03em' }}>
                {queue.queue_position === 0 ? '—' : queue.queue_position}
              </div>
            </div>

            {/* Calling Actions */}
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

        {/* Public Display Card */}
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

      {/* RECHARGE MODAL */}
      {isRechargeOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: 28,
            maxWidth: 440,
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
            border: '1px solid #ebebeb'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#222222' }}>Recharge Quota</h3>
                <p style={{ fontSize: 13, color: '#717171', margin: '4px 0 0' }}>Select a package to add calls to your balance</p>
              </div>
              <button
                onClick={() => !isProcessing && setIsRechargeOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#999999', cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {TOKEN_PACKS.map(pack => (
                <div
                  key={pack.id}
                  onClick={() => !isProcessing && handleRecharge(pack)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 18px',
                    borderRadius: 16,
                    border: '1.5px solid #ebebeb',
                    backgroundColor: '#fafafa',
                    cursor: isProcessing ? 'wait' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#FF385C';
                    e.currentTarget.style.backgroundColor = '#fff8f9';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#ebebeb';
                    e.currentTarget.style.backgroundColor = '#fafafa';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#222222' }}>
                        {pack.tokens.toLocaleString()} Calls
                      </span>
                      {pack.tag && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#FF385C',
                          backgroundColor: '#ffeef1',
                          padding: '2px 8px',
                          borderRadius: 999
                        }}>
                          {pack.tag}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#717171', marginTop: 2 }}>{pack.name} Pack</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#222222' }}>₹{pack.price}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>One-time</div>
                  </div>
                </div>
              ))}
            </div>

            {isProcessing && (
              <p style={{ textAlign: 'center', fontSize: 13, color: '#FF385C', fontWeight: 600, marginTop: 16, margin: '16px 0 0' }}>
                Connecting to Razorpay gateway...
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
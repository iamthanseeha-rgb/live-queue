import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { loadRazorpayScript } from './razorpay';
import LandingPage from './LandingPage';
import { normalizeSlug, validateSlug, safeDecode } from './lib/slug';
import { unlockSound, playChime } from './lib/sound';
import { announceToken, primeSpeech, speechSupported, stopSpeaking } from './lib/speech';
import {
  color, font, size, space, radius, shadow,
  panel, btnPrimary, btnSecondary, btnDark, input as inputStyle, label as labelStyle,
  eyebrow, h2, h3, body as bodyText, lead, tabularNums, srOnly,
} from './lib/theme';
import {
  IconMoon, IconSun, IconExpand, IconSpeaker, IconSpeakerOff, IconPlus, IconMinus,
  IconDownload, IconExternal, IconQr, IconArrowRight, IconCheck, IconWallet, IconLink,
} from './lib/icons';
import { friendlyError } from './lib/errors';

const STATIC_PAGES = ['contact', 'privacy', 'terms', 'refunds', 'welcome', 'login'];
const LOW_BALANCE = 50;          // show the "running low" banner at or below this many calls
const TITLE_MAX = 60;
const SUBTITLE_MAX = 80;
const POLL_LIVE_MS = 60000;      // safety re-sync for public displays even when realtime looks healthy
const POLL_OFFLINE_MS = 15000;   // faster re-sync while realtime is reconnecting

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatInr = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function App() {
  const [session, setSession] = useState(null);
  const [currentPage, setCurrentPage] = useState('home'); // 'home' | 'welcome' | 'admin_login' | 'status' | 'admin_dash' | 'reset_password' | 'contact' | 'privacy' | 'terms' | 'refunds'
  const currentPageRef = useRef('home');

  // Public search & status state
  const [inputQuery, setInputQuery] = useState('');
  const [activeQueue, setActiveQueue] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [displayStatus, setDisplayStatus] = useState('connecting'); // 'connecting' | 'live' | 'reconnecting'
  const [soundOn, setSoundOn] = useState(false);
  // Voice announcements are remembered per device so a waiting-room screen that
  // reloads overnight comes back the way the clinic left it.
  const [voiceOn, setVoiceOn] = useState(() => {
    try { return localStorage.getItem('lq_voice') !== 'off'; } catch { return true; }
  });
  // Dark display for a waiting-room screen that stays on all day. Opt-in, per device.
  const [displayDark, setDisplayDark] = useState(() => {
    try { return localStorage.getItem('lq_display_theme') === 'dark'; } catch { return false; }
  });
  const soundOnRef = useRef(false);
  const voiceOnRef = useRef(true);
  const prevPosRef = useRef(null);
  const activeQueueRef = useRef(null);
  const statusSlugRef = useRef(null);
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
  const [remainingTokens, setRemainingTokens] = useState(null);
  const [accountStatus, setAccountStatus] = useState('Active');
  const [adminError, setAdminError] = useState('');
  const [deskFailed, setDeskFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const deskUserRef = useRef(null); // id of the host whose desk is currently loaded

  // Recharge modal state
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [packs, setPacks] = useState(null);
  const [packsError, setPacksError] = useState('');
  const [paymentNotice, setPaymentNotice] = useState(null); // { type: 'info'|'success'|'error', text }

  // Admin Edit Counter state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editSlug, setEditSlug] = useState('');

  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { activeQueueRef.current = activeQueue; }, [activeQueue]);
  // The realtime callback closes over an old render, so read these through refs.
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  const getRouteSlug = () => {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!path || path === 'index.html') return null;
    return safeDecode(path).toLowerCase();
  };

  const pageForSlug = (slug) => (slug === 'login' ? 'admin_login' : slug);

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

  const goToLogin = (mode = 'login') => {
    switchAuthMode(mode);
    window.history.pushState({}, '', '/login');
    setCurrentPage('admin_login');
  };

  // ── Desk loading ─────────────────────────────────────────
  function clearDesk() {
    deskUserRef.current = null;
    setQueue(null);
    setRemainingTokens(null);
    setAccountStatus('Active');
    setAdminError('');
    setDeskFailed(false);
    setIsEditing(false);
    setIsRechargeOpen(false);
    setPaymentNotice(null);
  }

  function applyDesk(data) {
    if (!data) return;
    if (data.queue) setQueue(data.queue);
    if (typeof data.remaining_tokens === 'number') setRemainingTokens(data.remaining_tokens);
    if (data.status) setAccountStatus(data.status);
  }

  // One server call creates the host's rows if they're missing (idempotent, race-safe)
  // and returns desk + balance + status. Errors never fall back to defaults.
  async function loadDesk(uid, { silent = false } = {}) {
    if (!uid) return;
    deskUserRef.current = uid;
    if (!silent) setDeskFailed(false);
    const { data, error } = await supabase.rpc('ensure_my_desk');
    if (deskUserRef.current !== uid) return; // a different host signed in meanwhile – drop stale result
    if (error || !data) {
      if (!silent) {
        setDeskFailed(true);
        setAdminError(friendlyError(error, 'Couldn’t load your desk. Check your connection and retry.'));
      }
      return;
    }
    setDeskFailed(false);
    if (!silent) setAdminError('');
    applyDesk(data);
  }

  // ── Auth wiring ──────────────────────────────────────────
  useEffect(() => {
    const slug = getRouteSlug();
    if (STATIC_PAGES.includes(slug)) {
      setCurrentPage(pageForSlug(slug));
    } else if (slug) {
      setCurrentPage('status');
      fetchQueueBySlug(slug);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === 'PASSWORD_RECOVERY') {
        setCurrentPage('reset_password');
        return;
      }

      if (!newSession) {
        clearDesk();
        if (['admin_dash', 'reset_password'].includes(currentPageRef.current)) {
          window.history.replaceState({}, '', '/');
          setCurrentPage('home');
        }
        return;
      }

      const route = getRouteSlug();
      if (event === 'INITIAL_SESSION' && (!route || route === 'login')) {
        window.history.replaceState({}, '', '/');
        setCurrentPage('admin_dash');
      }
      if (event === 'SIGNED_IN' && currentPageRef.current === 'admin_login') {
        window.history.replaceState({}, '', '/');
        setCurrentPage('admin_dash');
      }

      // Load the desk only when the signed-in host changes (not on hourly token refresh).
      const uid = newSession.user.id;
      if (deskUserRef.current !== uid) {
        clearDesk();
        // Supabase advises not to call the client synchronously inside this callback.
        setTimeout(() => loadDesk(uid), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync browser back/forward buttons with active page state
  useEffect(() => {
    const handleLocationChange = () => {
      const slug = getRouteSlug();
      if (STATIC_PAGES.includes(slug)) {
        if (slug === 'login' && session) {
          window.history.replaceState({}, '', '/');
          setCurrentPage('admin_dash');
        } else {
          setCurrentPage(pageForSlug(slug));
        }
      } else if (slug) {
        setCurrentPage('status');
        fetchQueueBySlug(slug);
      } else {
        setCurrentPage(session ? 'admin_dash' : 'home');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, [session]);

  // Browser tab titles (also what WhatsApp / bookmarks show)
  useEffect(() => {
    const titles = {
      home: 'LiveQueue – Live token display for clinics',
      welcome: 'LiveQueue – Live token display for clinics',
      admin_login: 'Sign in – LiveQueue',
      admin_dash: 'Desk Manager – LiveQueue',
      reset_password: 'Set new password – LiveQueue',
      contact: 'Contact – LiveQueue',
      privacy: 'Privacy Policy – LiveQueue',
      terms: 'Terms of Service – LiveQueue',
      refunds: 'Refund Policy – LiveQueue',
    };
    if (currentPage === 'status') {
      document.title = activeQueue
        ? `${activeQueue.queue_position ? `Now serving ${activeQueue.queue_position}` : 'Not started'} · ${activeQueue.queue_title} – LiveQueue`
        : 'Live queue – LiveQueue';
    } else {
      document.title = titles[currentPage] || 'LiveQueue';
    }
  }, [currentPage, activeQueue?.queue_position, activeQueue?.queue_title]);

  // ── Public display ───────────────────────────────────────
  function applyPublicRow(row) {
    if (!row) return;
    const prev = prevPosRef.current;
    if (prev !== null && row.queue_position > prev) {
      playChime();
      // Chime first, then the number – announcing over the chime makes both unclear.
      if (soundOnRef.current && voiceOnRef.current) {
        announceToken(row.queue_position, { delay: 700 });
      }
    }
    prevPosRef.current = row.queue_position;
    setActiveQueue(row);
  }

  async function fetchQueueBySlug(slug) {
    if (!slug) return;
    const cleanSlug = slug.toLowerCase();
    if (statusSlugRef.current !== cleanSlug) {
      // Different desk: forget the previous one so its number never flashes on screen.
      statusSlugRef.current = cleanSlug;
      prevPosRef.current = null;
      setActiveQueue(null);
      setDisplayStatus('connecting');
    }
    setLookupError('');
    if (isFetchingRef.current === cleanSlug) return; // same request already in flight
    isFetchingRef.current = cleanSlug;
    const { data, error } = await supabase.rpc('get_public_queue', { p_slug: cleanSlug });
    if (isFetchingRef.current === cleanSlug) isFetchingRef.current = false;
    if (statusSlugRef.current !== cleanSlug) return;

    if (error) {
      setDisplayStatus('reconnecting');
      if (!activeQueueRef.current) setLookupError(friendlyError(error, 'Couldn’t load this queue. Retrying…'));
      return;
    }
    if (!data) {
      setLookupError(`No queue found at “/${cleanSlug}”. Check the link on the clinic’s poster.`);
      setActiveQueue(null);
      return;
    }
    if (data.slug && data.slug !== cleanSlug) {
      // The clinic renamed its link – keep old posters working and show the new address.
      statusSlugRef.current = data.slug;
      window.history.replaceState({}, '', `/${data.slug}`);
    }
    applyPublicRow(data);
  }

  // Realtime + self-healing re-sync for TVs and phones
  useEffect(() => {
    if (currentPage !== 'status' || !activeQueue?.public_key) return;

    const refetch = () => fetchQueueBySlug(statusSlugRef.current);
    const channel = supabase
      .channel(`queue:${activeQueue.public_key}`)
      .on('broadcast', { event: 'queue_update' }, ({ payload }) => {
        applyPublicRow({ ...activeQueueRef.current, ...payload });
        setDisplayStatus('live');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setDisplayStatus('live');
          refetch(); // catch up on anything missed while disconnected
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setDisplayStatus('reconnecting');
        }
      });

    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    const onOnline = () => refetch();
    const onOffline = () => setDisplayStatus('reconnecting');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let timer;
    const schedule = () => {
      timer = setTimeout(() => { refetch(); schedule(); }, navigator.onLine === false ? POLL_OFFLINE_MS : POLL_LIVE_MS);
    };
    schedule();

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      supabase.removeChannel(channel);
    };
  }, [currentPage, activeQueue?.public_key]);

  // Keep TV / tablet screens awake while showing the queue
  useEffect(() => {
    if (currentPage !== 'status' || !('wakeLock' in navigator)) return;
    let lock = null;
    const request = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch { /* not allowed (battery saver etc.) – ignore */ }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      lock?.release?.().catch(() => {});
    };
  }, [currentPage]);

  function handleEnableSound() {
    const ok = unlockSound();
    setSoundOn(ok);
    // Must happen inside this same tap – that gesture is what unlocks speech on iOS.
    if (ok && voiceOn) primeSpeech();
  }

  function handleToggleDisplayTheme() {
    const next = !displayDark;
    setDisplayDark(next);
    try { localStorage.setItem('lq_display_theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
  }

  function handleToggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    try { localStorage.setItem('lq_voice', next ? 'on' : 'off'); } catch { /* private mode */ }
    if (next) {
      primeSpeech();
      // Say the current number once so the clinic can set the volume before a patient waits on it.
      const now = activeQueueRef.current?.queue_position;
      if (now > 0) setTimeout(() => announceToken(now, { repeat: 1 }), 120);
    } else {
      stopSpeaking();
    }
  }

  // Never leave an announcement mid-sentence when the screen navigates away.
  useEffect(() => {
    if (currentPage !== 'status') stopSpeaking();
  }, [currentPage]);
  useEffect(() => stopSpeaking, []);

  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    const cleanSlug = normalizeSlug(inputQuery);
    if (!cleanSlug) {
      setLookupError('Enter the link name from the clinic’s poster, e.g. dr-adam.');
      return;
    }
    window.history.pushState({}, '', `/${cleanSlug}`);
    setCurrentPage('status');
    fetchQueueBySlug(cleanSlug);
  }

  // ── Dashboard: stay in sync with other devices on the same desk ──
  useEffect(() => {
    if (currentPage !== 'admin_dash' || !queue?.public_key) return;
    const uid = deskUserRef.current;
    let firstSubscribe = true;
    const channel = supabase
      .channel(`queue:${queue.public_key}`)
      .on('broadcast', { event: 'queue_update' }, ({ payload }) => {
        setQueue((q) => (q && q.queue_id === payload.queue_id ? { ...q, ...payload } : q));
        loadDesk(uid, { silent: true }); // another device may have used a call – refresh balance
      })
      .subscribe((status) => {
        // after a reconnect, catch up on anything other devices did meanwhile
        if (status === 'SUBSCRIBED' && !firstSubscribe) loadDesk(uid, { silent: true });
        if (status === 'SUBSCRIBED') firstSubscribe = false;
      });
    const onVisible = () => { if (document.visibilityState === 'visible') loadDesk(uid, { silent: true }); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      supabase.removeChannel(channel);
    };
  }, [currentPage, queue?.public_key]);

  // ── Auth Functions ───────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setAuthSuccess('');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    setLoading(false);
    if (error) {
      setAuthError(/invalid login/i.test(error.message)
        ? 'Email or password is incorrect.'
        : /confirm/i.test(error.message)
          ? 'Please confirm your email first – check your inbox for the activation link.'
          : friendlyError(error, error.message));
    } else {
      setPassword('');
      // Navigation to the dashboard + desk loading happen in the SIGNED_IN listener.
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

    if (password.length < 8) {
      setAuthError('Use at least 8 characters for your password.');
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
      setAuthError(/weak|pwned|leaked/i.test(error.message)
        ? 'This password is too easy to guess. Please choose a stronger one.'
        : friendlyError(error, error.message));
    } else if (data?.session) {
      // Email confirmation is off – the SIGNED_IN listener takes over.
    } else {
      // Same screen for new and already-registered emails, so the form can't be used
      // to check who has an account.
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
    if (error) setAuthError(friendlyError(error, error.message));
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
    if (error) setAuthError(friendlyError(error, error.message));
    else setForgotSubmitted(true);
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    if (newPassword.length < 8) {
      setAuthError('Use at least 8 characters for your new password.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setAuthError(friendlyError(error, error.message));
    } else {
      setAuthSuccess('Password updated! Opening your desk…');
      setNewPassword('');
      setTimeout(() => {
        window.history.replaceState({}, '', '/');
        setCurrentPage('admin_dash');
      }, 700);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    clearDesk(); // never leave the previous host's desk on a shared reception PC
    switchAuthMode('login');
    window.history.replaceState({}, '', '/');
    setCurrentPage('home');
  }

  // ── Queue Counter Controls (all server-side, atomic) ─────
  async function runQueueAction(fn) {
    if (!queue || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setAdminError('');
    const { data, error } = await supabase.rpc(fn, { p_queue_id: queue.queue_id });
    busyRef.current = false;
    setBusy(false);
    if (error) {
      setAdminError(friendlyError(error));
      loadDesk(deskUserRef.current, { silent: true });
      return;
    }
    applyDesk(data);
  }

  const advanceQueue = () => runQueueAction('call_next');

  const previousQueue = () => {
    if (queue && queue.queue_position > 0) runQueueAction('call_previous');
  };

  const resetQueue = () => {
    if (!queue || !window.confirm(`Reset "${queue.queue_title}" back to token 0?`)) return;
    runQueueAction('reset_queue');
  };

  function startEditing() {
    if (!queue) return;
    setEditTitle(queue.queue_title || '');
    setEditSubtitle(queue.queue_subtitle || '');
    setEditSlug(queue.slug || '');
    setAdminError('');
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setAdminError('');
    if (queue) {
      setEditTitle(queue.queue_title || '');
      setEditSubtitle(queue.queue_subtitle || '');
      setEditSlug(queue.slug || '');
    }
  }

  async function saveDetails(e) {
    e.preventDefault();
    setAdminError('');

    const title = editTitle.trim().replace(/\s+/g, ' ');
    const subtitle = editSubtitle.trim().replace(/\s+/g, ' ');
    if (!title) { setAdminError('Please enter a counter name, e.g. Dr. Adam.'); return; }
    if (title.length > TITLE_MAX) { setAdminError(`Keep the counter name to ${TITLE_MAX} characters or fewer.`); return; }
    if (subtitle.length > SUBTITLE_MAX) { setAdminError(`Keep the subtitle to ${SUBTITLE_MAX} characters or fewer.`); return; }

    const cleanSlug = normalizeSlug(editSlug);
    const slugError = validateSlug(editSlug, cleanSlug);
    if (slugError) { setAdminError(slugError); return; }

    if (cleanSlug !== queue.slug && !window.confirm(
      `Change your public link to /${cleanSlug}?\n\nPeople using the old link /${queue.slug} will be redirected, but please print a new poster so it shows the new address.`
    )) return;

    const { data, error } = await supabase
      .from('queue_details')
      .update({ queue_title: title, queue_subtitle: subtitle, slug: cleanSlug })
      .eq('queue_id', queue.queue_id)
      .select()
      .single();

    if (error) {
      setAdminError(error.code === '23505'
        ? `The link “/${cleanSlug}” is already taken. Please choose another.`
        : friendlyError(error));
    } else {
      setQueue(data);
      setIsEditing(false);
    }
  }

  // ── Recharge (Razorpay order → checkout → server verification) ──
  async function openRecharge() {
    setIsRechargeOpen(true);
    setPaymentNotice(null);
    if (packs) return;
    setPacksError('');
    const { data, error } = await supabase
      .from('token_packs')
      .select('id, name, tokens, price_paise, tag')
      .eq('active', true)
      .order('sort', { ascending: true });
    if (error || !data?.length) setPacksError(friendlyError(error, 'Couldn’t load recharge packs. Please try again.'));
    else setPacks(data);
  }

  function closeRecharge() {
    if (isProcessing) return;
    setIsRechargeOpen(false);
    setPaymentNotice(null);
  }

  // If the browser couldn't confirm the payment, the Razorpay webhook still credits it –
  // keep refreshing the balance for a short while so it appears without a reload.
  function refreshBalanceSoon() {
    const uid = deskUserRef.current;
    [4000, 12000, 30000].forEach((ms) => setTimeout(() => loadDesk(uid, { silent: true }), ms));
  }

  async function handleRecharge(pack) {
    if (isProcessing) return;
    setIsProcessing(true);
    setPaymentNotice(null);

    // A phone that has held this tab open for days can still be carrying an expired
    // access token. Refresh it first, otherwise create-order answers 401 and the user
    // only sees a generic "couldn't start the payment".
    let live = null;
    try {
      const { data: got } = await supabase.auth.getSession();
      live = got?.session ?? null;
      // Only force a refresh when we can see the token is about to expire. If the
      // refresh fails, keep the token we have and let the server decide – a transient
      // network blip shouldn't block a payment that would have worked.
      const expiresAt = Number(live?.expires_at) || 0;
      if (live && expiresAt && expiresAt * 1000 - Date.now() < 120000) {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed?.session) live = refreshed.session;
        } catch { /* keep the existing session */ }
      }
    } catch {
      live = null;
    }
    if (!live) {
      setPaymentNotice({ type: 'error', text: 'Your sign-in has expired on this device. Please log out, sign in again, and retry the recharge.' });
      setIsProcessing(false);
      return;
    }

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setPaymentNotice({ type: 'error', text: 'Couldn’t open Razorpay. Check your internet connection and try again.' });
      setIsProcessing(false);
      return;
    }

    const { data: order, error: orderError } = await supabase.functions.invoke('create-order', {
      body: { pack_id: pack.id },
    });
    if (orderError || !order?.order_id) {
      const status = orderError?.context?.status;
      let text = 'Couldn’t start the payment. Please try again in a moment.';
      if (status === 401) text = 'Your sign-in has expired on this device. Please log out, sign in again, and retry the recharge.';
      else if (status === 403) text = 'This account is blocked. Please contact support.';
      else if (status === 400) text = 'That pack is no longer available. Please refresh the page.';
      else if (status === 502) text = 'Razorpay is not responding right now. Please try again in a minute.';
      console.error('create-order failed', status ?? '(no status)', orderError);
      setPaymentNotice({ type: 'error', text });
      setIsProcessing(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'LiveQueue',
      description: `${pack.tokens.toLocaleString('en-IN')} calls · ${pack.name} pack`,
      prefill: { email: session?.user?.email || '' },
      notes: { pack_id: pack.id },
      theme: { color: '#E00B41' },
      handler: async (response) => {
        setPaymentNotice({ type: 'info', text: 'Payment received. Adding calls to your balance…' });
        const { data: result, error: verifyError } = await supabase.functions.invoke('verify-payment', {
          body: {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
        });
        if (verifyError || !result?.ok) {
          setPaymentNotice({
            type: 'info',
            text: `Payment received. Your calls will appear within a minute. If they don’t, WhatsApp us with payment ID ${response.razorpay_payment_id}.`,
          });
          refreshBalanceSoon();
        } else {
          if (typeof result.remaining_tokens === 'number') setRemainingTokens(result.remaining_tokens);
          setPaymentNotice({ type: 'success', text: `${pack.tokens.toLocaleString('en-IN')} calls added to your balance.` });
        }
        setIsProcessing(false);
      },
      modal: { ondismiss: () => setIsProcessing(false) },
    });
    rzp.on('payment.failed', (resp) => {
      setPaymentNotice({ type: 'error', text: `Payment failed${resp?.error?.description ? `: ${resp.error.description}` : ''}. Please try again.` });
      setIsProcessing(false);
    });
    rzp.open();
  }

  // Print poster function for PDF generation
  function handlePrintPoster() {
    const svgEl = document.getElementById('poster-qr-code');
    if (!svgEl || !queue) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow pop-ups for this site to print the poster.');
      return;
    }

    const title = escapeHtml(queue.queue_title);
    const subtitle = escapeHtml(queue.queue_subtitle || 'Consultation Counter');
    const link = escapeHtml(currentPublicLink.replace(/^https?:\/\//, ''));

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=794" />
          <title>${title} - Printable QR Code Poster</title>
          <style>
            /* Sized in millimetres, not vh: a phone's screen height must never decide
               how tall the poster is, or it spills onto a second page. */
            @page { size: A4 portrait; margin: 0; }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body { margin: 0; padding: 0; background: #ffffff; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #222222;
            }
            .sheet {
              width: 210mm;
              height: 296mm;
              padding: 18mm 14mm 14mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              text-align: center;
              overflow: hidden;
              page-break-after: avoid;
              break-after: avoid;
            }
            .top, .middle, .bottom { width: 100%; }
            .header-badge {
              display: inline-block;
              background: #fff1f2;
              border: 0.6mm solid #fecdd3;
              color: #C8093A;
              font-size: 10pt;
              font-weight: 800;
              letter-spacing: 1.6pt;
              text-transform: uppercase;
              padding: 2.5mm 8mm;
              border-radius: 999px;
              margin-bottom: 7mm;
            }
            h1 {
              font-size: 30pt;
              font-weight: 900;
              margin: 0 0 2mm;
              letter-spacing: -0.6pt;
              line-height: 1.15;
              overflow-wrap: anywhere;
            }
            .subtitle {
              font-size: 16pt;
              color: #C8093A;
              font-weight: 600;
              margin: 0;
              overflow-wrap: anywhere;
            }
            .qr-box {
              background: #ffffff;
              border: 0.8mm solid #f0f0f0;
              border-radius: 10mm;
              padding: 8mm;
              box-shadow: 0 4mm 10mm rgba(0,0,0,0.06);
              display: inline-block;
            }
            .qr-box img { width: 88mm; height: 88mm; display: block; }
            .instruction-card {
              max-width: 150mm;
              background: #f8fafc;
              border: 0.5mm solid #e2e8f0;
              border-radius: 6mm;
              padding: 6mm 8mm;
              margin: 8mm auto 0;
            }
            .instruction-title { font-size: 13pt; font-weight: 800; margin-bottom: 2mm; color: #0f172a; }
            .instruction-text { font-size: 10.5pt; color: #475569; margin: 0; line-height: 1.45; }
            .link-pill {
              display: inline-block;
              background: #ffffff;
              border: 0.6mm solid #cbd5e1;
              color: #0f172a;
              font-size: 14pt;
              font-weight: 800;
              padding: 3.5mm 8mm;
              border-radius: 999px;
              margin-top: 4mm;
              overflow-wrap: anywhere;
            }
            .footer { font-size: 9.5pt; color: #64748b; font-weight: 600; letter-spacing: 0.3pt; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              <div class="header-badge">LIVE QUEUE STATUS</div>
              <h1>${title}</h1>
              <div class="subtitle">${subtitle}</div>
            </div>

            <div class="middle">
              <div class="qr-box">
                <img src="${qrDataUrl}" alt="Live Queue QR Code" />
              </div>

              <div class="instruction-card">
                <div class="instruction-title">Scan to track your token on your phone</div>
                <p class="instruction-text">
                  Point your phone camera at the QR code above, or visit the link below to watch the live queue from anywhere.
                </p>
                <div class="link-pill">${link}</div>
              </div>
            </div>

            <div class="bottom">
              <div class="footer">Powered by livequeue.co.in \u2022 Real-time queue updates</div>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function () { window.print(); }, 300);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  }

  const isAccountBlocked = accountStatus === 'Block';
  const isOutOfCalls = remainingTokens !== null && remainingTokens <= 0;
  const isBlocked = isAccountBlocked || isOutOfCalls;
  const isLowBalance = remainingTokens !== null && remainingTokens > 0 && remainingTokens <= LOW_BALANCE;
  const currentPublicLink = queue?.slug ? `${window.location.origin}/${queue.slug}` : '';


  // ══════════════════════════════════════════════════════════
  // VIEW: DEDICATED LANDING PAGE (/welcome) FOR META ADS
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'welcome') {
    return (
      <LandingPage
        onGetStarted={() => goToLogin('signup')}
        onSignIn={() => goToLogin('login')}
        onGoHome={() => {
          window.history.pushState({}, '', '/');
          setCurrentPage('home');
        }}
        onNavigate={(page) => {
          window.history.pushState({}, '', `/${page}`);
          setCurrentPage(page);
        }}
      />
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 1: PUBLIC / TV / MOBILE DISPLAY (Airbnb Colorful)
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'status') {
    const notStarted = activeQueue?.queue_position === 0;
    const live = displayStatus === 'live';
    const dk = displayDark;

    // Two palettes for one layout: light for a phone or a bright waiting room,
    // dark for a screen that stays on all day (easier on the eyes, less burn-in).
    const t = dk
      ? {
        bg: color.darkBg,
        wash: 'radial-gradient(circle at 50% 0%, rgba(224,11,65,0.22) 0%, rgba(224,11,65,0) 62%)',
        panel: color.darkPanel,
        line: color.darkLine,
        title: color.darkText,
        sub: '#FF7A9C',
        eyebrow: color.darkMuted,
        number: '#FF3D6B',
        chrome: 'rgba(255,255,255,0.07)',
        chromeLine: 'rgba(255,255,255,0.14)',
        chromeText: color.darkText,
        quiet: color.darkMuted,
      }
      : {
        bg: '#FFFFFF',
        wash: 'radial-gradient(circle at 50% 0%, rgba(224,11,65,0.09) 0%, rgba(224,11,65,0) 58%)',
        panel: color.surface,
        line: color.line,
        title: color.ink,
        sub: color.brandText,
        eyebrow: color.muted,
        number: color.brand,
        chrome: color.surface,
        chromeLine: color.line,
        chromeText: color.body,
        quiet: color.muted,
      };

    const chromeBtn = {
      background: t.chrome,
      color: t.chromeText,
      border: `1px solid ${t.chromeLine}`,
      padding: '9px 15px',
      borderRadius: radius.pill,
      cursor: 'pointer',
      fontSize: size.sm,
      fontWeight: 600,
      fontFamily: font.sans,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      boxShadow: dk ? 'none' : shadow.xs,
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    };

    const statusTone = !live
      ? { bg: dk ? 'rgba(245,158,11,0.16)' : color.warningSoft, line: dk ? 'rgba(245,158,11,0.4)' : '#FDE68A', fg: dk ? '#FCD34D' : color.warning, dot: '#F59E0B' }
      : notStarted
        ? { bg: dk ? 'rgba(148,163,184,0.16)' : '#F1F5F9', line: dk ? 'rgba(148,163,184,0.32)' : color.line, fg: dk ? color.darkMuted : color.body, dot: '#94A3B8' }
        : { bg: dk ? 'rgba(224,11,65,0.18)' : color.brandSoft, line: dk ? 'rgba(224,11,65,0.42)' : color.brandSoftBorder, fg: dk ? '#FF9DB6' : color.brandText, dot: color.brand };

    return (
      <div
        onClick={() => { if (!soundOn) handleEnableSound(); }}
        style={{
          minHeight: '100dvh',
          background: t.bg,
          backgroundImage: t.wash,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: font.sans,
          color: t.title,
          textAlign: 'center',
          position: 'relative',
          boxSizing: 'border-box',
          width: '100%',
          transition: 'background-color .3s ease, color .3s ease',
        }}
      >
        {/* ── Top chrome: kept low-contrast so it doesn't compete with the number ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: space[2], padding: `${space[4]}px ${space[5]}px 0`, flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.history.replaceState({}, '', '/');
              setLookupError('');
              if (session) {
                setCurrentPage('admin_dash');
                loadDesk(session.user.id, { silent: true });
              } else {
                setCurrentPage('home');
              }
            }}
            style={chromeBtn}
          >
            {session ? '← Back to Controller' : '← Search Desk'}
          </button>

          {activeQueue && (
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleToggleDisplayTheme(); }}
                style={chromeBtn}
                aria-pressed={dk}
                aria-label={dk ? 'Switch to light display' : 'Switch to dark display'}
              >
                {dk ? <IconSun size={15} /> : <IconMoon size={15} />}
                <span>{dk ? 'Light' : 'Dark'}</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                style={chromeBtn}
                aria-label="Toggle full screen"
              >
                <IconExpand size={15} />
                <span>Full screen</span>
              </button>
            </div>
          )}
        </div>

        {activeQueue ? (
          <>
            {/* ── Clinic identity ── */}
            <div style={{ padding: `${space[5]}px ${space[5]}px 0` }}>
              <h1 style={{
                fontSize: 'clamp(1.4rem, 3.2vw, 2.6rem)',
                fontWeight: 750,
                margin: 0,
                letterSpacing: '-0.025em',
                color: t.title,
                lineHeight: 1.15,
                overflowWrap: 'anywhere',
              }}>
                {activeQueue.queue_title}
              </h1>
              {activeQueue.queue_subtitle && (
                <p style={{
                  fontSize: 'clamp(0.85rem, 1.5vw, 1.15rem)',
                  color: t.sub,
                  margin: `${space[2]}px 0 0`,
                  fontWeight: 600,
                  overflowWrap: 'anywhere',
                }}>
                  {activeQueue.queue_subtitle}
                </p>
              )}
            </div>

            {/* ── The number. This is the whole point of the screen, so it gets
                   the room: no card, no border, just the digits. ── */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: `${space[4]}px ${space[4]}px`,
              minHeight: 0,
            }}>
              <span style={{
                fontSize: 'clamp(11px, 1.3vw, 17px)',
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: t.eyebrow,
                fontWeight: 700,
                display: 'block',
              }}>
                Now Serving
              </span>
              <div
                className="lq-num"
                aria-live="assertive"
                style={{
                  fontSize: 'clamp(5rem, min(62vh, 58vw), 44rem)',
                  fontWeight: 800,
                  lineHeight: 0.95,
                  margin: `${space[2]}px 0 0`,
                  letterSpacing: '-0.045em',
                  color: t.number,
                }}
              >
                {notStarted ? '—' : activeQueue.queue_position}
              </div>
            </div>

            {/* ── Bottom bar: connection state on the left, sound on the right ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: `${space[3]}px ${space[4]}px`,
              padding: `0 ${space[5]}px ${space[6]}px`,
            }}>
              <div
                role="status"
                aria-live="polite"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 14px',
                  borderRadius: radius.pill,
                  background: statusTone.bg,
                  border: `1px solid ${statusTone.line}`,
                  color: statusTone.fg,
                  fontSize: 11,
                  fontWeight: 750,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  backgroundColor: statusTone.dot, display: 'inline-block',
                  boxShadow: `0 0 0 3.5px ${statusTone.dot}33`,
                }} />
                {displayStatus === 'reconnecting'
                  ? 'Reconnecting… number may be out of date'
                  : displayStatus === 'connecting'
                    ? 'Connecting…'
                    : notStarted ? 'Queue Not Started' : 'Live Calling'}
              </div>

              {soundOn ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ color: t.quiet, fontSize: size.sm, fontWeight: 550 }}>
                    {voiceOn && speechSupported()
                      ? 'Sound on – a chime plays and the number is announced'
                      : 'Sound on – a chime plays when the number changes'}
                  </span>
                  {speechSupported() && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleVoice(); }}
                      aria-pressed={voiceOn}
                      style={{ ...chromeBtn, color: voiceOn ? (dk ? '#FF9DB6' : color.brandText) : t.quiet }}
                    >
                      {voiceOn ? <IconSpeaker size={15} /> : <IconSpeakerOff size={15} />}
                      {voiceOn ? 'Voice announcement on' : 'Voice announcement off'}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleEnableSound(); }}
                  style={{ ...chromeBtn, color: dk ? '#FF9DB6' : color.brandText, fontWeight: 650 }}
                >
                  <IconSpeaker size={15} />
                  Tap to turn on sound {speechSupported() ? '& announcements' : ''}
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: `${space[8]}px ${space[5]}px`,
          }}>
            <div style={{
              maxWidth: 380, width: '100%',
              background: t.panel,
              padding: `${space[8]}px ${space[6]}px`,
              borderRadius: radius.lg,
              border: `1px solid ${t.line}`,
              boxShadow: dk ? 'none' : shadow.md,
              boxSizing: 'border-box',
            }}>
              <p style={{
                color: lookupError ? (dk ? '#FF9E95' : color.danger) : t.quiet,
                fontSize: size.md, fontWeight: 600, margin: `0 0 ${space[5]}px`, lineHeight: 1.5,
              }}>
                {lookupError || 'Loading live display…'}
              </p>
              {lookupError && (
                <button
                  type="button"
                  onClick={() => {
                    window.history.replaceState({}, '', '/');
                    setLookupError('');
                    setCurrentPage('home');
                  }}
                  style={{ ...btnPrimary, width: '100%' }}
                >
                  Back to Search
                </button>
              )}
            </div>
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
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: font.sans, color: color.ink, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: `1px solid ${color.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setCurrentPage('home')}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: color.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(255, 56, 92, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
                <line x1="7" y1="16" x2="10" y2="16" />
              </svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: color.ink }}>
              live<span style={{ color: color.brand }}>queue</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {session ? (
              <button
                onClick={() => {
                  setCurrentPage('admin_dash');
                  loadDesk(session.user.id, { silent: true });
                }}
                style={{ background: '#222222', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Dashboard
              </button>
            ) : (
              <button
                onClick={() => goToLogin('login')}
                style={{ background: 'transparent', color: color.ink, border: `1px solid ${color.lineStrong}`, padding: '9px 16px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Sign In / Sign Up
              </button>
            )}
          </div>
        </header>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px 80px' }}>
          <div style={{ textAlign: 'center', maxWidth: 680, marginBottom: 36 }}>
            <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)', fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.02em', lineHeight: 1.15, color: color.ink }}>
              Track any queue,<br />live in real-time.
            </h1>
            <p style={{ fontSize: 16, color: '#717171', margin: 0, fontWeight: 400, lineHeight: 1.5 }}>
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
                border: `1px solid ${color.lineStrong}`,
                borderRadius: 999,
                padding: '6px 6px 6px 20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <span style={{ color: color.muted, fontSize: 18, fontWeight: 500, marginRight: 2, userSelect: 'none' }}>/</span>
                <input
                  id="queue-search"
                  type="text"
                  aria-label="Queue link name"
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={200}
                  required
                  placeholder="dr-adam or room-1"
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  style={{ border: 'none', outline: 'none', fontSize: 16, color: color.ink, background: '#ffffff', fontWeight: 500, width: '100%', padding: 0 }}
                />
              </div>

              <button
                type="submit"
                style={{
                  background: color.brand,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 999,
                  height: 46,
                  padding: '0 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
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

        <footer style={{
          borderTop: `1px solid ${color.line}`,
          padding: '24px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: 960,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          gap: 12,
          fontSize: 13,
          color: '#717171',
          textAlign: 'center'
        }}>
          <div style={{ textAlign: 'center' }}>
            © {new Date().getFullYear()} LiveQueue. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/contact');
                setCurrentPage('contact');
              }}
              style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
            >
              Contact Us
            </button>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/privacy');
                setCurrentPage('privacy');
              }}
              style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
            >
              Privacy Policy
            </button>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/terms');
                setCurrentPage('terms');
              }}
              style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
            >
              Terms of Service
            </button>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/refunds');
                setCurrentPage('refunds');
              }}
              style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
            >
              Refund Policy
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW: CONTACT US (AIRBNB STYLE - CLEAN)
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'contact') {
    const whatsappUrl = "https://wa.me/918921677207?text=Hi%20LiveQueue%20Team%2C%20I%20have%20an%20issue%2Fsuggestion%3A";

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: font.sans, color: color.ink, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: `1px solid ${color.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: color.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(255, 56, 92, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
                <line x1="7" y1="16" x2="10" y2="16" />
              </svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: color.ink }}>
              live<span style={{ color: color.brand }}>queue</span>
            </span>
          </div>

          <div>
            <button
              onClick={async () => {
                window.history.replaceState({}, '', '/');
                if (session) {
                  setCurrentPage('admin_dash');
                  loadDesk(session.user.id, { silent: true });
                } else {
                  setCurrentPage('home');
                }
              }}
              style={{ background: color.page, color: color.ink, border: `1px solid ${color.lineStrong}`, padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              ← Back
            </button>
          </div>
        </header>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px 80px', textAlign: 'center' }}>
          <div style={{ maxWidth: 520, width: '100%' }}>
            
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: color.brandSoft,
              border: '1px solid #fecdd3',
              color: color.brandText,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 16
            }}>
              Support & Feedback
            </div>

            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em', color: color.ink }}>
              Contact Us
            </h1>
            <p style={{ fontSize: 16, color: '#717171', margin: '0 0 32px', lineHeight: 1.5 }}>
              Please contact us for any issues or suggestions. We're here to help you keep your queue flowing seamlessly.
            </p>

            <div style={{
              backgroundColor: '#ffffff',
              border: '1.5px solid #ffe4e6',
              borderRadius: 28,
              padding: '36px 24px',
              boxShadow: '0 16px 40px -8px rgba(255, 56, 92, 0.12), 0 4px 16px rgba(0,0,0,0.04)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, color: color.muted, fontWeight: 800 }}>
                Direct WhatsApp Support
              </div>
              
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: color.ink, margin: '8px 0 24px', letterSpacing: '-0.02em' }}>
                +91 8921677207
              </div>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  width: '100%',
                  maxWidth: 320,
                  padding: '14px 24px',
                  borderRadius: 999,
                  background: '#25D366',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(37, 211, 102, 0.35)',
                  boxSizing: 'border-box'
                }}
              >
                Chat on WhatsApp ↗
              </a>
            </div>

            <div style={{ marginTop: 28, fontSize: 13, color: color.muted }}>
              Typically replies within minutes • Monday to Sunday
            </div>

          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW: PRIVACY POLICY (FOR META COMPLIANCE)
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'privacy') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: font.sans, color: color.ink, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: `1px solid ${color.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: color.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(255, 56, 92, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
                <line x1="7" y1="16" x2="10" y2="16" />
              </svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: color.ink }}>
              live<span style={{ color: color.brand }}>queue</span>
            </span>
          </div>

          <button
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setCurrentPage('home');
            }}
            style={{ background: color.page, color: color.ink, border: `1px solid ${color.lineStrong}`, padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ← Back
          </button>
        </header>

        <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: color.ink }}>Privacy Policy</h1>
          <p style={{ color: '#717171', fontSize: 13, marginBottom: 28 }}>Last Updated: September 2026</p>

          <div style={{ lineHeight: 1.7, fontSize: 15, color: '#334155' }}>
            <p>At LiveQueue (accessible via <strong>livequeue.co.in</strong>), we prioritize the privacy and security of both our host administrators and public queue viewers.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>1. Information We Collect</h3>
            <p>We collect basic account credentials (such as your full name and email address) when you register as a host. For public users tracking queues, no personal identity registration is demanded or stored.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>2. How Information Is Used</h3>
            <p>Your details are used strictly to maintain your desk profile, synchronize live queue token updates in real time, and deliver password-reset or security verification links.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>3. Payments & Data Protection</h3>
            <p>Payment transactions for quota recharges are securely handled by Razorpay. LiveQueue does not access, process, or store sensitive credit card numbers or UPI PINs on its servers.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>4. Third-Party Sharing</h3>
            <p>We do not sell, rent, or trade your personal data to any marketing third parties. Data is only communicated with essential cloud infrastructure (Supabase authentication and database storage) to deliver the service.</p>
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW: TERMS OF SERVICE (FOR META COMPLIANCE)
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'terms') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: font.sans, color: color.ink, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: `1px solid ${color.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: color.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(255, 56, 92, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
                <line x1="7" y1="16" x2="10" y2="16" />
              </svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: color.ink }}>
              live<span style={{ color: color.brand }}>queue</span>
            </span>
          </div>

          <button
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setCurrentPage('home');
            }}
            style={{ background: color.page, color: color.ink, border: `1px solid ${color.lineStrong}`, padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ← Back
          </button>
        </header>

        <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: color.ink }}>Terms of Service</h1>
          <p style={{ color: '#717171', fontSize: 13, marginBottom: 28 }}>Last Updated: September 2026</p>

          <div style={{ lineHeight: 1.7, fontSize: 15, color: '#334155' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 20, marginBottom: 8 }}>1. Acceptance of Terms</h3>
            <p>By creating an account or accessing the live queue display at livequeue.co.in, you agree to comply with and be bound by these Terms of Service.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>2. Service Description</h3>
            <p>LiveQueue provides an online queue counter management service allowing clinics, businesses, and desk managers to control sequential token numbers and display them publicly in real time.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>3. Account & Token Usage</h3>
            <p>Hosts receive an initial token quota upon account activation. Advancing tokens consumes quota units from the balance. Additional calls can be purchased through designated recharge packs.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>4. Acceptable Conduct</h3>
            <p>Users agree not to exploit the platform for spamming, illegitimate queuing, or activities that compromise server infrastructure or public availability.</p>
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW: REFUND & CANCELLATION (FOR META & RAZORPAY COMPLIANCE)
  // ══════════════════════════════════════════════════════════
  if (currentPage === 'refunds') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: font.sans, color: color.ink, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: `1px solid ${color.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: color.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(255, 56, 92, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
                <line x1="7" y1="16" x2="10" y2="16" />
              </svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: color.ink }}>
              live<span style={{ color: color.brand }}>queue</span>
            </span>
          </div>

          <button
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setCurrentPage('home');
            }}
            style={{ background: color.page, color: color.ink, border: `1px solid ${color.lineStrong}`, padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ← Back
          </button>
        </header>

        <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: color.ink }}>Cancellation & Refund Policy</h1>
          <p style={{ color: '#717171', fontSize: 13, marginBottom: 28 }}>Last Updated: September 2026</p>

          <div style={{ lineHeight: 1.7, fontSize: 15, color: '#334155' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 20, marginBottom: 8 }}>1. Digital Services & Token Packs</h3>
            <p>LiveQueue delivers immediate digital service access. Quota packs purchased provide instant calling credits directly to your desk controller account.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>2. Refund Policy</h3>
            <p>Because calling quota units are made available immediately upon payment capture, consumed tokens are non-refundable. If an amount is debited from your payment source but quota tokens are not credited due to network or gateway technical issues, our team will investigate and either credit the pack or initiate a full refund within 5 to 7 business days.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: color.ink, marginTop: 24, marginBottom: 8 }}>3. Contact Support</h3>
            <p>For any billing inquiries, transaction verifications, or assistance, reach us directly via WhatsApp at <strong>+91 8921677207</strong>.</p>
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
      <div style={{ minHeight: '100vh', backgroundColor: color.page, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.sans, padding: 20 }}>
        <div style={{ maxWidth: 420, width: '100%', backgroundColor: '#ffffff', borderRadius: 24, padding: 28, boxShadow: '0 12px 36px rgba(0,0,0,0.08)', border: `1px solid ${color.line}` }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: color.ink }}>Set New Password</h2>
          <p style={{ color: '#717171', fontSize: 13, margin: '0 0 20px' }}>Enter your new password to regain access to your desk.</p>

          {authError && (
            <div style={{ backgroundColor: color.dangerSoft, color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 16 }}>
              {authError}
            </div>
          )}

          {authSuccess && (
            <div role="status" style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 16 }}>
              {authSuccess}
            </div>
          )}

          <form onSubmit={handleUpdatePassword}>
            <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
              <label htmlFor="new-password" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>New Password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: 14,
                background: color.brand,
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
      <div style={{
        minHeight: '100vh', backgroundColor: color.page,
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(224,11,65,0.07) 0%, rgba(224,11,65,0) 55%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: font.sans, padding: 16,
      }}>
        <div style={{ maxWidth: 420, width: '100%', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#ffffff', borderRadius: radius.xl, boxShadow: shadow.lg, border: `1px solid ${color.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px', borderBottom: `1px solid ${color.line}` }}>
            <button
              type="button"
              aria-label="Close sign-in"
              onClick={() => {
                switchAuthMode('login');
                window.history.pushState({}, '', '/');
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

          <div style={{ padding: '24px 20px' }}>
            {authMode !== 'forgot' && signupStep !== 'link_sent' && (
              <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 20 }}>
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
              <div role="alert" style={{ backgroundColor: color.dangerSoft, color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 18 }}>
                {authError}
              </div>
            )}

            {authSuccess && (
              <div style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 18 }}>
                {authSuccess}
              </div>
            )}

            {authMode === 'login' && (
              <div>
                <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: color.ink }}>Welcome Host</h2>
                <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px' }}>Sign in using your registered email and password.</p>

                <form onSubmit={handleLogin}>
                  <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                    <label htmlFor="login-email" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Email Address</label>
                    <input
                      id="login-email"
                      autoComplete="email"
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
                    />
                  </div>

                  <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                    <label htmlFor="login-password" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Password</label>
                    <input
                      id="login-password"
                      autoComplete="current-password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
                    />
                  </div>

                  <div style={{ textAlign: 'right', marginBottom: 18 }}>
                    <button
                      type="button"
                      onClick={() => switchAuthMode('forgot')}
                      style={{ background: 'none', border: 'none', color: color.brandText, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
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
                      background: color.brand,
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

                <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#717171' }}>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchAuthMode('signup')}
                    style={{ background: 'none', border: 'none', color: color.brandText, fontWeight: 700, cursor: 'pointer', padding: 0 }}
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
                    <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: color.ink }}>Create Your Desk</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px' }}>Register your host account with email and password.</p>

                    <form onSubmit={handleSignUp}>
                      <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label htmlFor="signup-name" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Full Name <span style={{ color: color.brandText }}>*</span>
                        </label>
                        <input
                          id="signup-name"
                          autoComplete="name"
                          maxLength={80}
                          type="text"
                          required
                          placeholder="Dr. Adam or Clinic Host"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label htmlFor="signup-email" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Email Address <span style={{ color: color.brandText }}>*</span>
                        </label>
                        <input
                          id="signup-email"
                          autoComplete="email"
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label htmlFor="signup-password" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Password <span style={{ color: color.brandText }}>*</span>
                        </label>
                        <input
                          id="signup-password"
                          autoComplete="new-password"
                          minLength={8}
                          type="password"
                          required
                          placeholder="At least 8 characters"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 18 }}>
                        <label htmlFor="signup-confirm" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Confirm Password <span style={{ color: color.brandText }}>*</span>
                        </label>
                        <input
                          id="signup-confirm"
                          autoComplete="new-password"
                          type="password"
                          required
                          placeholder="Repeat password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: 14,
                          background: color.brand,
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

                    <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#717171' }}>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchAuthMode('login')}
                        style={{ background: 'none', border: 'none', color: color.brandText, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        Sign In
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#ffeef1', color: color.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                      </svg>
                    </div>
                    <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 8px', color: color.ink }}>Check Your Inbox</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
                      If this email isn’t registered yet, we’ve sent an activation link to:<br />
                      <strong style={{ color: color.ink }}>{email}</strong>
                    </p>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, fontSize: 13, color: color.body, lineHeight: 1.5, textAlign: 'left', marginBottom: 20 }}>
                      💡 <strong>Next step:</strong> Click the confirmation link in your inbox, then come back and sign in. Already have an account? Sign in, or use “Forgot password?”.
                    </div>
                    <button
                      type="button"
                      onClick={() => switchAuthMode('login')}
                      style={{ width: '100%', padding: 13, background: color.brand, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}
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
                    <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: color.ink }}>Reset Password</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px' }}>Enter your email to receive a password reset link.</p>

                    <form onSubmit={handleForgotPassword}>
                      <div style={{ border: `1px solid ${color.lineStrong}`, borderRadius: 12, padding: '10px 14px', marginBottom: 18 }}>
                        <label htmlFor="forgot-email" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Registered Email</label>
                        <input
                          id="forgot-email"
                          autoComplete="email"
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: color.ink, background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', padding: 14, background: color.brand, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 16 }}
                      >
                        {loading ? 'Sending link...' : 'Send Reset Link'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: '#f0fdf4', color: '#166534', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: color.ink }}>Reset Link Sent</h2>
                    <p style={{ color: '#717171', fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
                      If <strong>{email}</strong> has a LiveQueue account, a reset link is on its way.
                    </p>
                  </div>
                )}

                <div style={{ textAlign: 'center', marginTop: 10 }}>
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
  // VIEW 5: ADMIN CONTROLLER DASHBOARD
  // ══════════════════════════════════════════════════════════
  const deskReady = !!(session && queue && queue.admin_id === session.user.id);
  const fieldLabel = labelStyle;
  const fieldInput = inputStyle;
  const noticeColors = {
    info: { bg: '#EFF6FF', fg: '#1E40AF', border: '#BFDBFE' },
    success: { bg: color.positiveSoft, fg: '#0B5F44', border: '#A7E8CF' },
    error: { bg: color.dangerSoft, fg: color.danger, border: '#FECACA' },
  };

  const navBtn = {
    background: 'transparent', border: 'none', color: color.body,
    padding: '8px 10px', fontSize: size.sm, fontWeight: 550,
    cursor: 'pointer', fontFamily: font.sans, borderRadius: radius.sm,
    whiteSpace: 'nowrap',
  };

  // Small uppercase heading used at the top of each dashboard panel.
  const panelHead = { ...eyebrow, fontSize: 11, marginBottom: space[4], display: 'block' };

  const balanceTone = !deskReady || remainingTokens === null
    ? { fg: color.muted, bg: '#F1F5F9' }
    : remainingTokens <= 100
      ? { fg: color.danger, bg: color.dangerSoft }
      : { fg: color.positive, bg: color.positiveSoft };

  return (
    <div style={{
      minHeight: '100vh', background: color.page, fontFamily: font.sans,
      color: color.body, width: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Host bar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'saturate(180%) blur(12px)',
        WebkitBackdropFilter: 'saturate(180%) blur(12px)',
        borderBottom: `1px solid ${color.line}`,
      }}>
        <div style={{
          maxWidth: 1080, margin: '0 auto', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          height: 64, padding: '0 20px', boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, background: color.brand,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8.5h10M7 12.5h6M7 16.5h3" />
              </svg>
            </span>
            <span className="lq-logo-text" style={{
              fontWeight: 700, fontSize: size.md, color: color.ink,
              letterSpacing: '-0.02em', whiteSpace: 'nowrap',
            }}>
              Desk Manager
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/contact');
                setCurrentPage('contact');
              }}
              className="lq-nav-hide"
              style={navBtn}
            >
              Contact
            </button>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/');
                setCurrentPage('home');
              }}
              className="lq-hdr-btn"
              style={{ ...btnSecondary, padding: '8px 14px', fontSize: size.sm, marginLeft: space[2] }}
            >
              Home
            </button>
            {session && (
              <button type="button" onClick={handleLogout} style={{ ...navBtn, marginLeft: space[1] }}>
                Log out
              </button>
            )}
          </div>
        </div>
      </header>

      <main style={{
        maxWidth: 1080, margin: '0 auto', width: '100%', boxSizing: 'border-box',
        padding: `${space[6]}px 20px ${space[16]}px`, flex: 1,
      }}>

        {!session && (
          <div style={{ ...panel, padding: `${space[12]}px ${space[6]}px`, textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
            <p style={{ ...bodyText, margin: `0 0 ${space[5]}px`, fontSize: size.md }}>
              You’re signed out. Sign in to manage your desk.
            </p>
            <button type="button" onClick={() => goToLogin('login')} style={btnPrimary}>
              Sign In
            </button>
          </div>
        )}

        {session && (
          <>
            {/* ── Who's signed in ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              marginBottom: space[5], fontSize: size.sm, minWidth: 0,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color.positive, flexShrink: 0 }} />
              <span style={{ fontWeight: 650, color: color.ink, whiteSpace: 'nowrap' }}>
                {session.user?.user_metadata?.name || 'Host'}
              </span>
              <span style={{ color: color.lineStrong }}>·</span>
              <span style={{ color: color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.user?.email}
              </span>
            </div>

            {/* ── Notices ── */}
            {deskReady && isLowBalance && !isAccountBlocked && (
              <div role="status" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: space[3], background: color.warningSoft, color: color.warning,
                border: '1px solid #FDE68A', padding: `${space[3]}px ${space[4]}px`,
                borderRadius: radius.md, fontSize: size.base, marginBottom: space[5],
                flexWrap: 'wrap',
              }}>
                <span>Only <strong>{remainingTokens}</strong> calls left. Recharge now so your desk doesn’t stop mid-clinic.</span>
                <button
                  type="button"
                  onClick={openRecharge}
                  style={{ ...btnPrimary, background: color.warning, boxShadow: 'none', padding: '8px 14px', fontSize: size.sm, flexShrink: 0 }}
                >
                  Recharge
                </button>
              </div>
            )}

            {deskReady && isAccountBlocked && (
              <div role="alert" style={{
                background: color.dangerSoft, color: color.danger, border: '1px solid #FECACA',
                padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.md,
                fontSize: size.base, marginBottom: space[5], lineHeight: 1.55,
              }}>
                This account is paused, so calling is turned off. Please contact LiveQueue support on WhatsApp.
              </div>
            )}

            {adminError && (
              <div role="alert" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: space[3], background: color.dangerSoft, color: color.danger,
                border: '1px solid #FECACA', padding: `${space[3]}px ${space[4]}px`,
                borderRadius: radius.md, fontSize: size.base, marginBottom: space[5],
                flexWrap: 'wrap',
              }}>
                <span>{adminError}</span>
                {deskFailed && (
                  <button
                    type="button"
                    onClick={() => loadDesk(session.user.id)}
                    style={{ ...btnPrimary, background: color.danger, boxShadow: 'none', padding: '8px 14px', fontSize: size.sm, flexShrink: 0 }}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {!deskReady && !deskFailed && (
              <div style={{
                ...panel, padding: `${space[16]}px ${space[5]}px`, textAlign: 'center',
                color: color.muted, fontSize: size.base, fontWeight: 550,
              }}>
                Loading your desk…
              </div>
            )}

            {deskReady && (
              <div className="lq-dash-grid">

                {/* ══ LEFT: the control the host actually uses ══ */}
                <section style={{ ...panel, padding: space[6], boxShadow: shadow.md }}>
                  {isEditing ? (
                    <form onSubmit={saveDetails}>
                      <span style={panelHead}>Desk details</span>

                      <div style={{ marginBottom: space[4] }}>
                        <label htmlFor="edit-title" style={fieldLabel}>Counter Name</label>
                        <input
                          id="edit-title"
                          type="text"
                          required
                          maxLength={TITLE_MAX}
                          placeholder="e.g. Dr. Adam"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          style={fieldInput}
                        />
                      </div>

                      <div style={{ marginBottom: space[4] }}>
                        <label htmlFor="edit-subtitle" style={fieldLabel}>Subtitle / Room</label>
                        <input
                          id="edit-subtitle"
                          type="text"
                          maxLength={SUBTITLE_MAX}
                          placeholder="e.g. Room 2 · General Medicine"
                          value={editSubtitle}
                          onChange={e => setEditSubtitle(e.target.value)}
                          style={fieldInput}
                        />
                      </div>

                      <div style={{ marginBottom: space[5] }}>
                        <label htmlFor="edit-slug" style={fieldLabel}>Public Link</label>
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          border: `1px solid ${color.lineStrong}`, borderRadius: radius.md,
                          padding: '0 12px', background: color.surface,
                        }}>
                          <span style={{ color: color.faint, fontSize: size.md }}>/</span>
                          <input
                            id="edit-slug"
                            type="text"
                            autoCapitalize="none"
                            autoCorrect="off"
                            maxLength={60}
                            value={editSlug}
                            onChange={e => setEditSlug(e.target.value)}
                            style={{
                              flex: 1, minWidth: 0, border: 'none', outline: 'none',
                              padding: '13px 6px', fontSize: size.md, background: color.surface,
                              color: color.ink, fontFamily: font.sans,
                            }}
                          />
                        </div>
                        <div style={{ fontSize: size.sm, color: color.muted, marginTop: space[2] }}>
                          English letters, numbers and hyphens. Will be saved as <strong>/{normalizeSlug(editSlug) || '…'}</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: space[2] }}>
                        <button type="submit" style={{ ...btnDark, flex: 1, borderRadius: radius.md }}>
                          Save Changes
                        </button>
                        <button type="button" onClick={cancelEditing} style={{ ...btnSecondary, borderRadius: radius.md }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div style={{
                        display: 'flex', alignItems: 'flex-start',
                        justifyContent: 'space-between', gap: space[3],
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <h2 style={{
                            fontSize: size.xl, fontWeight: 750, margin: 0,
                            letterSpacing: '-0.022em', color: color.ink, overflowWrap: 'anywhere',
                          }}>
                            {queue.queue_title}
                          </h2>
                          <div style={{ color: color.muted, fontSize: size.base, marginTop: 2, overflowWrap: 'anywhere' }}>
                            {queue.queue_subtitle}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={startEditing}
                          style={{ ...btnSecondary, padding: '8px 14px', fontSize: size.sm, flexShrink: 0 }}
                        >
                          Edit name &amp; link
                        </button>
                      </div>

                      {/* ── Current token ── */}
                      <div style={{
                        margin: `${space[6]}px 0`,
                        padding: `${space[6]}px ${space[4]}px`,
                        background: color.raised,
                        border: `1px solid ${color.line}`,
                        borderRadius: radius.md,
                        textAlign: 'center',
                      }}>
                        <span style={{ ...eyebrow, fontSize: 11 }}>Current Token</span>
                        <div
                          className="lq-num"
                          aria-live="polite"
                          style={{
                            fontSize: 'clamp(3.4rem, 13vw, 5.5rem)',
                            fontWeight: 800,
                            lineHeight: 1.02,
                            margin: `${space[2]}px 0 0`,
                            color: color.ink,
                            letterSpacing: '-0.04em',
                            opacity: busy ? 0.45 : 1,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          {queue.queue_position === 0 ? '—' : queue.queue_position}
                        </div>
                      </div>

                      {/* ── Calling actions ── */}
                      <div style={{ display: 'flex', gap: space[3] }}>
                        <button
                          type="button"
                          onClick={previousQueue}
                          disabled={busy || queue.queue_position <= 0 || isAccountBlocked}
                          title="Go back one token. The call is refunded only if you undo within 2 minutes."
                          style={{
                            ...btnSecondary,
                            flex: 1,
                            padding: '16px 10px',
                            borderRadius: radius.md,
                            fontSize: size.base,
                            whiteSpace: 'nowrap',
                            background: busy || queue.queue_position <= 0 || isAccountBlocked ? color.page : color.surface,
                            color: busy || queue.queue_position <= 0 || isAccountBlocked ? color.faint : color.ink,
                            cursor: busy || queue.queue_position <= 0 || isAccountBlocked ? 'not-allowed' : 'pointer',
                          }}
                        >
                          -1 Previous
                        </button>

                        <button
                          type="button"
                          onClick={isOutOfCalls && !isAccountBlocked ? openRecharge : advanceQueue}
                          disabled={busy || isAccountBlocked}
                          style={{
                            ...btnPrimary,
                            flex: 2,
                            padding: '16px 12px',
                            borderRadius: radius.md,
                            fontSize: size.lg,
                            whiteSpace: 'nowrap',
                            background: isAccountBlocked ? '#E2E8F0' : isOutOfCalls ? color.ink : color.brand,
                            color: isAccountBlocked ? color.muted : '#FFFFFF',
                            boxShadow: isBlocked ? 'none' : shadow.brand,
                            cursor: busy ? 'wait' : isAccountBlocked ? 'not-allowed' : 'pointer',
                            opacity: busy ? 0.75 : 1,
                          }}
                        >
                          {isAccountBlocked ? 'Account Paused' : isOutOfCalls ? 'No calls left · Recharge' : busy ? 'Calling…' : '+1 Next Token'}
                        </button>
                      </div>

                      <div style={{ textAlign: 'center', marginTop: space[4] }}>
                        <button
                          type="button"
                          onClick={resetQueue}
                          disabled={busy || isAccountBlocked}
                          style={{
                            background: 'none', border: 'none', color: color.muted,
                            fontSize: size.sm, cursor: 'pointer', textDecoration: 'underline',
                            fontFamily: font.sans, padding: space[1],
                          }}
                        >
                          Reset count back to 0
                        </button>
                      </div>
                    </>
                  )}
                </section>

                {/* ══ RIGHT: balance and the patient-facing screen ══ */}
                <div style={{ display: 'grid', gap: space[5] }}>

                  {/* ── Balance ── */}
                  <section style={{ ...panel, padding: space[6] }}>
                    <span style={panelHead}>Remaining Calls</span>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[4], flexWrap: 'wrap' }}>
                      <div>
                        <div
                          className="lq-num"
                          style={{
                            fontSize: size['3xl'], fontWeight: 800, lineHeight: 1.05,
                            letterSpacing: '-0.03em', color: balanceTone.fg,
                          }}
                        >
                          {deskReady && remainingTokens !== null ? remainingTokens.toLocaleString('en-IN') : '…'}
                        </div>
                        <div style={{ fontSize: size.sm, color: color.muted, marginTop: 2 }}>
                          one call = one “+1 Next Token” tap
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={openRecharge}
                        disabled={!deskReady}
                        style={{
                          ...btnPrimary,
                          padding: '11px 18px',
                          fontSize: size.base,
                          cursor: deskReady ? 'pointer' : 'not-allowed',
                          opacity: deskReady ? 1 : 0.6,
                        }}
                      >
                        <IconPlus size={16} />
                        Recharge
                      </button>
                    </div>
                  </section>

                  {/* ── Public display ── */}
                  <section style={{ ...panel, padding: space[6], textAlign: 'center' }}>
                    <span style={panelHead}>Public display link</span>

                    <div style={{ fontSize: size.base, fontWeight: 650, overflowWrap: 'anywhere', marginBottom: space[5] }}>
                      <a href={currentPublicLink} target="_blank" rel="noreferrer" style={{ color: color.brandText, textDecoration: 'none' }}>
                        {currentPublicLink.replace(/^https?:\/\//, '')}
                      </a>
                    </div>

                    <div style={{
                      display: 'inline-block', padding: space[4], background: color.surface,
                      border: `1px solid ${color.line}`, borderRadius: radius.md, boxShadow: shadow.xs,
                    }}>
                      <QRCodeSVG id="poster-qr-code" value={currentPublicLink} size={148} fgColor={color.ink} level="H" />
                    </div>

                    <p style={{ fontSize: size.sm, color: color.muted, margin: `${space[3]}px 0 0` }}>
                      Patients scan this to follow the queue on their phone.
                    </p>

                    <div style={{ display: 'grid', gap: space[3], marginTop: space[5] }}>
                      <a
                        href={currentPublicLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...btnDark, width: '100%', fontSize: size.base }}
                      >
                        <IconExternal size={16} />
                        Launch TV Display Screen
                      </a>

                      <button
                        type="button"
                        onClick={handlePrintPoster}
                        style={{
                          ...btnSecondary,
                          width: '100%',
                          fontSize: size.base,
                          background: color.brandSoft,
                          color: color.brandText,
                          borderColor: color.brandSoftBorder,
                        }}
                      >
                        <IconDownload size={16} />
                        Print Poster / Save as PDF
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── RECHARGE MODAL ── */}
      {isRechargeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recharge-title"
          onKeyDown={(e) => { if (e.key === 'Escape') closeRecharge(); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(11, 18, 32, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
        >
          <div style={{
            background: color.surface,
            borderRadius: radius.xl,
            padding: space[6],
            maxWidth: 440,
            width: '100%',
            boxShadow: '0 24px 60px rgba(11, 18, 32, 0.28)',
            border: `1px solid ${color.line}`,
            textAlign: 'left',
            boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[4], marginBottom: space[5] }}>
              <div>
                <h3 id="recharge-title" style={{ fontSize: size.xl, fontWeight: 750, margin: 0, color: color.ink, letterSpacing: '-0.02em' }}>
                  Recharge Calls
                </h3>
                <p style={{ fontSize: size.sm, color: color.muted, margin: `${space[1]}px 0 0` }}>
                  Pick a pack. One call = one “+1 Next Token” tap.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close recharge"
                onClick={closeRecharge}
                disabled={isProcessing}
                style={{
                  background: 'none', border: 'none', fontSize: 20, color: color.muted,
                  cursor: isProcessing ? 'not-allowed' : 'pointer', padding: 4, lineHeight: 1, flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            {packsError && (
              <div role="alert" style={{
                background: color.dangerSoft, color: color.danger, border: '1px solid #FECACA',
                padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.sm,
                fontSize: size.base, marginBottom: space[3],
              }}>
                {packsError}
              </div>
            )}

            {!packs && !packsError && (
              <p style={{ fontSize: size.base, color: color.muted, margin: `${space[2]}px 0` }}>Loading packs…</p>
            )}

            <div style={{ display: 'grid', gap: space[3] }}>
              {(packs || []).map(pack => (
                <button
                  type="button"
                  key={pack.id}
                  onClick={() => handleRecharge(pack)}
                  disabled={isProcessing}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: space[4],
                    width: '100%',
                    padding: `${space[4]}px ${space[5]}px`,
                    borderRadius: radius.md,
                    border: `1px solid ${color.line}`,
                    background: color.raised,
                    cursor: isProcessing ? 'wait' : 'pointer',
                    transition: 'border-color .15s ease, background-color .15s ease',
                    font: 'inherit',
                    fontFamily: font.sans,
                    color: 'inherit',
                    textAlign: 'left',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                      <span className="lq-num" style={{ fontSize: size.md, fontWeight: 750, color: color.ink }}>
                        {pack.tokens.toLocaleString('en-IN')} Calls
                      </span>
                      {pack.tag && (
                        <span style={{
                          fontSize: 10, fontWeight: 750, textTransform: 'uppercase',
                          letterSpacing: '0.06em', color: color.brandText,
                          background: color.brandSoft, border: `1px solid ${color.brandSoftBorder}`,
                          padding: '2px 8px', borderRadius: radius.pill,
                        }}>
                          {pack.tag}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: size.sm, color: color.muted, marginTop: 2 }}>
                      {pack.name} Pack
                    </span>
                  </span>

                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="lq-num" style={{ display: 'block', fontSize: size.lg, fontWeight: 800, color: color.ink, letterSpacing: '-0.02em' }}>
                      {formatInr(pack.price_paise)}
                    </span>
                    <span style={{ display: 'block', fontSize: size.xs, color: color.faint }}>One-time</span>
                  </span>
                </button>
              ))}
            </div>

            {isProcessing && !paymentNotice && (
              <p style={{ textAlign: 'center', fontSize: size.base, color: color.brandText, fontWeight: 600, margin: `${space[4]}px 0 0` }}>
                Connecting to Razorpay…
              </p>
            )}

            {paymentNotice && (
              <div role="status" style={{
                marginTop: space[4],
                background: noticeColors[paymentNotice.type].bg,
                color: noticeColors[paymentNotice.type].fg,
                border: `1px solid ${noticeColors[paymentNotice.type].border}`,
                padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.sm,
                fontSize: size.base, lineHeight: 1.5,
              }}>
                {paymentNotice.text}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

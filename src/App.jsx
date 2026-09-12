import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { loadRazorpayScript } from './razorpay';
import LandingPage from './LandingPage';
import { normalizeSlug, validateSlug, safeDecode } from './lib/slug';
import { unlockSound, playChime } from './lib/sound';
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
    if (prev !== null && row.queue_position > prev) playChime();
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
    setSoundOn(unlockSound());
  }

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
      setPaymentNotice({ type: 'error', text: 'Couldn’t start the payment. Please try again in a moment.' });
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
          <title>${title} - Printable QR Code Poster</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              margin: 0;
              padding: 60px 48px;
              background-color: #ffffff;
              color: #222222;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              min-height: 100vh;
              text-align: center;
            }
            .header-badge {
              display: inline-block;
              background: #fff1f2;
              border: 2px solid #fecdd3;
              color: #C8093A;
              font-size: 14px;
              font-weight: 800;
              letter-spacing: 2px;
              text-transform: uppercase;
              padding: 8px 24px;
              border-radius: 999px;
              margin-bottom: 24px;
            }
            h1 {
              font-size: 48px;
              font-weight: 900;
              margin: 0 0 10px;
              letter-spacing: -1.5px;
              line-height: 1.15;
              overflow-wrap: anywhere;
            }
            .subtitle {
              font-size: 24px;
              color: #C8093A;
              font-weight: 600;
              margin: 0 0 40px;
              overflow-wrap: anywhere;
            }
            .qr-box {
              background: #ffffff;
              border: 3px solid #f0f0f0;
              border-radius: 36px;
              padding: 40px;
              box-shadow: 0 16px 40px rgba(0,0,0,0.06);
              display: inline-block;
              margin-bottom: 36px;
            }
            .qr-box img {
              width: 320px;
              height: 320px;
              display: block;
            }
            .instruction-card {
              max-width: 520px;
              background: #f8fafc;
              border: 2px solid #e2e8f0;
              border-radius: 20px;
              padding: 20px 28px;
              margin: 0 auto 36px;
            }
            .instruction-title {
              font-size: 18px;
              font-weight: 800;
              margin-bottom: 8px;
              color: #0f172a;
            }
            .instruction-text {
              font-size: 14px;
              color: #475569;
              margin: 0;
              line-height: 1.5;
            }
            .link-pill {
              display: inline-block;
              background: #ffffff;
              border: 2px solid #cbd5e1;
              color: #0f172a;
              font-size: 18px;
              font-weight: 800;
              padding: 12px 28px;
              border-radius: 999px;
              margin-top: 12px;
              overflow-wrap: anywhere;
            }
            .footer {
              font-size: 13px;
              color: #64748b;
              font-weight: 600;
              letter-spacing: 0.5px;
            }
          </style>
        </head>
        <body>
          <div>
            <div class="header-badge">LIVE QUEUE STATUS</div>
            <h1>${title}</h1>
            <div class="subtitle">${subtitle}</div>
          </div>

          <div>
            <div class="qr-box">
              <img src="${qrDataUrl}" alt="Live Queue QR Code" />
            </div>

            <div class="instruction-card">
              <div class="instruction-title">Scan to track your token on your phone</div>
              <p class="instruction-text">
                Point your phone camera at the QR code above or visit the link below to watch the live queue anywhere.
              </p>
              <div class="link-pill">${link}</div>
            </div>
          </div>

          <div class="footer">
            Powered by livequeue.co.in • Real-time queue updates
          </div>

          <script>
            window.onload = function() {
              window.print();
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
    const pillButton = {
      background: '#ffffff',
      color: '#222222',
      border: '1px solid #fee2e2',
      padding: '8px 16px',
      borderRadius: 999,
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 600,
      boxShadow: '0 4px 12px rgba(255, 56, 92, 0.08)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    };
    return (
      <div
        onClick={() => { if (!soundOn) handleEnableSound(); }}
        style={{
          minHeight: '100dvh',
          backgroundColor: '#fffdfd',
          backgroundImage: 'radial-gradient(circle at 50% -10%, rgba(255, 56, 92, 0.12) 0%, rgba(255, 106, 0, 0.04) 40%, rgba(255, 255, 255, 0) 75%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
          color: '#222222',
          textAlign: 'center',
          padding: '76px 20px 32px',
          position: 'relative',
          boxSizing: 'border-box',
          width: '100%'
        }}
      >
        {/* Top bar: back + full screen */}
        <div style={{ position: 'absolute', top: 20, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', gap: 10, zIndex: 10 }}>
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
            style={pillButton}
          >
            {session ? '← Back to Controller' : '← Search Desk'}
          </button>
          {activeQueue && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              style={pillButton}
              aria-label="Toggle full screen"
            >
              Full screen
            </button>
          )}
        </div>

        {activeQueue ? (
          <div style={{ maxWidth: 'min(92vw, 1100px)', width: '100%', margin: '0 auto' }}>

            {/* Dynamic Status Pill */}
            <div
              role="status"
              aria-live="polite"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 16px',
                borderRadius: 999,
                background: !live ? '#fffbeb' : notStarted ? '#f1f5f9' : '#fff1f2',
                border: !live ? '1px solid #fde68a' : notStarted ? '1px solid #e2e8f0' : '1px solid #fecdd3',
                color: !live ? '#92400e' : notStarted ? '#475569' : '#C8093A',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginBottom: 16,
                boxShadow: '0 2px 10px rgba(255, 56, 92, 0.08)'
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: !live ? '#f59e0b' : notStarted ? '#94a3b8' : '#FF385C',
                display: 'inline-block',
                boxShadow: !live ? '0 0 0 4px rgba(245, 158, 11, 0.25)' : notStarted ? '0 0 0 4px rgba(148, 163, 184, 0.25)' : '0 0 0 4px rgba(255, 56, 92, 0.25)'
              }} />
              {displayStatus === 'reconnecting'
                ? 'Reconnecting… number may be out of date'
                : displayStatus === 'connecting'
                  ? 'Connecting…'
                  : notStarted ? 'Queue Not Started' : 'Live Calling'}
            </div>

            {/* Header Titles */}
            <h1 style={{
              fontSize: 'clamp(1.9rem, 5vw, 4rem)',
              fontWeight: 800,
              margin: '0 0 6px',
              letterSpacing: '-0.03em',
              color: '#222222',
              lineHeight: 1.2,
              overflowWrap: 'anywhere'
            }}>
              {activeQueue.queue_title}
            </h1>
            <p style={{
              fontSize: 'clamp(1rem, 2.6vw, 1.6rem)',
              color: '#C8093A',
              margin: '0 0 28px',
              fontWeight: 600,
              overflowWrap: 'anywhere'
            }}>
              {activeQueue.queue_subtitle}
            </p>

            {/* Core Colorful Airbnb Card */}
            <div style={{
              background: '#ffffff',
              border: '1.5px solid #ffe4e6',
              borderRadius: 32,
              padding: 'clamp(32px, 6vh, 64px) 20px',
              boxShadow: '0 20px 48px -8px rgba(255, 56, 92, 0.12), 0 8px 24px -4px rgba(0, 0, 0, 0.04)',
              margin: '0 auto',
              maxWidth: 'min(100%, 760px)',
              position: 'relative'
            }}>
              <span style={{
                fontSize: 'clamp(12px, 1.4vw, 18px)',
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: '#64748b',
                fontWeight: 800,
                display: 'block'
              }}>
                Now Serving
              </span>

              {/* Vibrant Airbnb Gradient Number */}
              <div
                aria-live="assertive"
                style={{
                  fontSize: 'clamp(7rem, min(30vw, 42vh), 26rem)',
                  fontWeight: 900,
                  lineHeight: 1.05,
                  margin: '8px 0 0',
                  letterSpacing: '-0.04em',
                  fontVariantNumeric: 'tabular-nums',
                  background: 'linear-gradient(135deg, #FF385C 0%, #E00B41 55%, #D70466 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                {notStarted ? '—' : activeQueue.queue_position}
              </div>
            </div>

            {/* Footer: sound control */}
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
              {soundOn ? (
                <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>
                  Sound on – a chime plays when the number changes
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleEnableSound(); }}
                  style={{ ...pillButton, color: '#C8093A', fontSize: 14 }}
                >
                  Tap to turn on sound
                </button>
              )}
            </div>

          </div>
        ) : (
          <div style={{
            maxWidth: 380,
            width: '100%',
            background: '#ffffff',
            padding: '32px 24px',
            borderRadius: 24,
            border: '1px solid #fee2e2',
            boxShadow: '0 12px 36px rgba(255, 56, 92, 0.08)'
          }}>
            <p style={{ color: lookupError ? '#b42318' : '#475569', fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>
              {lookupError || 'Loading live display...'}
            </p>
            {lookupError && (
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', '/');
                  setLookupError('');
                  setCurrentPage('home');
                }}
                style={{
                  background: 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '100%',
                  boxShadow: '0 4px 12px rgba(255, 56, 92, 0.3)'
                }}
              >
                Back to Search
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
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: '1px solid #ebebeb' }}>
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
                style={{ background: 'transparent', color: '#222222', border: '1px solid #dddddd', padding: '9px 16px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Sign In / Sign Up
              </button>
            )}
          </div>
        </header>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px 80px' }}>
          <div style={{ textAlign: 'center', maxWidth: 680, marginBottom: 36 }}>
            <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)', fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.02em', lineHeight: 1.15, color: '#222222' }}>
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
                border: '1px solid #dddddd',
                borderRadius: 999,
                padding: '6px 6px 6px 20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <span style={{ color: '#64748b', fontSize: 18, fontWeight: 500, marginRight: 2, userSelect: 'none' }}>/</span>
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
                  style={{ border: 'none', outline: 'none', fontSize: 16, color: '#222222', background: '#ffffff', fontWeight: 500, width: '100%', padding: 0 }}
                />
              </div>

              <button
                type="submit"
                style={{
                  background: 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)',
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
          borderTop: '1px solid #ebebeb',
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
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: '1px solid #ebebeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
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
              style={{ background: '#f7f7f7', color: '#222222', border: '1px solid #dddddd', padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
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
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              color: '#C8093A',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 16
            }}>
              Support & Feedback
            </div>

            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em', color: '#222222' }}>
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
              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, color: '#64748b', fontWeight: 800 }}>
                Direct WhatsApp Support
              </div>
              
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#222222', margin: '8px 0 24px', letterSpacing: '-0.02em' }}>
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

            <div style={{ marginTop: 28, fontSize: 13, color: '#64748b' }}>
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
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: '1px solid #ebebeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
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

          <button
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setCurrentPage('home');
            }}
            style={{ background: '#f7f7f7', color: '#222222', border: '1px solid #dddddd', padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ← Back
          </button>
        </header>

        <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#222222' }}>Privacy Policy</h1>
          <p style={{ color: '#717171', fontSize: 13, marginBottom: 28 }}>Last Updated: September 2026</p>

          <div style={{ lineHeight: 1.7, fontSize: 15, color: '#334155' }}>
            <p>At LiveQueue (accessible via <strong>livequeue.co.in</strong>), we prioritize the privacy and security of both our host administrators and public queue viewers.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>1. Information We Collect</h3>
            <p>We collect basic account credentials (such as your full name and email address) when you register as a host. For public users tracking queues, no personal identity registration is demanded or stored.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>2. How Information Is Used</h3>
            <p>Your details are used strictly to maintain your desk profile, synchronize live queue token updates in real time, and deliver password-reset or security verification links.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>3. Payments & Data Protection</h3>
            <p>Payment transactions for quota recharges are securely handled by Razorpay. LiveQueue does not access, process, or store sensitive credit card numbers or UPI PINs on its servers.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>4. Third-Party Sharing</h3>
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
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: '1px solid #ebebeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
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

          <button
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setCurrentPage('home');
            }}
            style={{ background: '#f7f7f7', color: '#222222', border: '1px solid #dddddd', padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ← Back
          </button>
        </header>

        <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#222222' }}>Terms of Service</h1>
          <p style={{ color: '#717171', fontSize: 13, marginBottom: 28 }}>Last Updated: September 2026</p>

          <div style={{ lineHeight: 1.7, fontSize: 15, color: '#334155' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 20, marginBottom: 8 }}>1. Acceptance of Terms</h3>
            <p>By creating an account or accessing the live queue display at livequeue.co.in, you agree to comply with and be bound by these Terms of Service.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>2. Service Description</h3>
            <p>LiveQueue provides an online queue counter management service allowing clinics, businesses, and desk managers to control sequential token numbers and display them publicly in real time.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>3. Account & Token Usage</h3>
            <p>Hosts receive an initial token quota upon account activation. Advancing tokens consumes quota units from the balance. Additional calls can be purchased through designated recharge packs.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>4. Acceptable Conduct</h3>
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
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 80, padding: '0 24px', borderBottom: '1px solid #ebebeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => {
            window.history.replaceState({}, '', '/');
            setCurrentPage('home');
          }}>
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

          <button
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setCurrentPage('home');
            }}
            style={{ background: '#f7f7f7', color: '#222222', border: '1px solid #dddddd', padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ← Back
          </button>
        </header>

        <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#222222' }}>Cancellation & Refund Policy</h1>
          <p style={{ color: '#717171', fontSize: 13, marginBottom: 28 }}>Last Updated: September 2026</p>

          <div style={{ lineHeight: 1.7, fontSize: 15, color: '#334155' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 20, marginBottom: 8 }}>1. Digital Services & Token Packs</h3>
            <p>LiveQueue delivers immediate digital service access. Quota packs purchased provide instant calling credits directly to your desk controller account.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>2. Refund Policy</h3>
            <p>Because calling quota units are made available immediately upon payment capture, consumed tokens are non-refundable. If an amount is debited from your payment source but quota tokens are not credited due to network or gateway technical issues, our team will investigate and either credit the pack or initiate a full refund within 5 to 7 business days.</p>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#222222', marginTop: 24, marginBottom: 8 }}>3. Contact Support</h3>
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
      <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: 20 }}>
        <div style={{ maxWidth: 420, width: '100%', backgroundColor: '#ffffff', borderRadius: 24, padding: 28, boxShadow: '0 12px 36px rgba(0,0,0,0.08)', border: '1px solid #ebebeb' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Set New Password</h2>
          <p style={{ color: '#717171', fontSize: 13, margin: '0 0 20px' }}>Enter your new password to regain access to your desk.</p>

          {authError && (
            <div style={{ backgroundColor: '#fff8f6', color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 16 }}>
              {authError}
            </div>
          )}

          {authSuccess && (
            <div role="status" style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 16 }}>
              {authSuccess}
            </div>
          )}

          <form onSubmit={handleUpdatePassword}>
            <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
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
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: 14,
                background: 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)',
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
      <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: 16 }}>
        <div style={{ maxWidth: 420, width: '100%', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#ffffff', borderRadius: 24, boxShadow: '0 12px 36px rgba(0,0,0,0.08)', border: '1px solid #ebebeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #ebebeb' }}>
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
              <div role="alert" style={{ backgroundColor: '#fff8f6', color: '#c13515', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 18 }}>
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
                <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Welcome Host</h2>
                <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px' }}>Sign in using your registered email and password.</p>

                <form onSubmit={handleLogin}>
                  <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                    <label htmlFor="login-email" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Email Address</label>
                    <input
                      id="login-email"
                      autoComplete="email"
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
                    />
                  </div>

                  <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                    <label htmlFor="login-password" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Password</label>
                    <input
                      id="login-password"
                      autoComplete="current-password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
                    />
                  </div>

                  <div style={{ textAlign: 'right', marginBottom: 18 }}>
                    <button
                      type="button"
                      onClick={() => switchAuthMode('forgot')}
                      style={{ background: 'none', border: 'none', color: '#C8093A', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
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
                      background: 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)',
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
                    style={{ background: 'none', border: 'none', color: '#C8093A', fontWeight: 700, cursor: 'pointer', padding: 0 }}
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
                    <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Create Your Desk</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px' }}>Register your host account with email and password.</p>

                    <form onSubmit={handleSignUp}>
                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label htmlFor="signup-name" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Full Name <span style={{ color: '#C8093A' }}>*</span>
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
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label htmlFor="signup-email" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Email Address <span style={{ color: '#C8093A' }}>*</span>
                        </label>
                        <input
                          id="signup-email"
                          autoComplete="email"
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                        <label htmlFor="signup-password" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Password <span style={{ color: '#C8093A' }}>*</span>
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
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 18 }}>
                        <label htmlFor="signup-confirm" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>
                          Confirm Password <span style={{ color: '#C8093A' }}>*</span>
                        </label>
                        <input
                          id="signup-confirm"
                          autoComplete="new-password"
                          type="password"
                          required
                          placeholder="Repeat password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: 14,
                          background: 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)',
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
                        style={{ background: 'none', border: 'none', color: '#C8093A', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        Sign In
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#ffeef1', color: '#FF385C', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                      </svg>
                    </div>
                    <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 8px', color: '#222222' }}>Check Your Inbox</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
                      If this email isn’t registered yet, we’ve sent an activation link to:<br />
                      <strong style={{ color: '#222222' }}>{email}</strong>
                    </p>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, fontSize: 13, color: '#475569', lineHeight: 1.5, textAlign: 'left', marginBottom: 20 }}>
                      💡 <strong>Next step:</strong> Click the confirmation link in your inbox, then come back and sign in. Already have an account? Sign in, or use “Forgot password?”.
                    </div>
                    <button
                      type="button"
                      onClick={() => switchAuthMode('login')}
                      style={{ width: '100%', padding: 13, background: 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}
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
                    <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: '#222222' }}>Reset Password</h2>
                    <p style={{ color: '#717171', fontSize: 13, margin: '0 0 18px' }}>Enter your email to receive a password reset link.</p>

                    <form onSubmit={handleForgotPassword}>
                      <div style={{ border: '1px solid #b0b0b0', borderRadius: 12, padding: '10px 14px', marginBottom: 18 }}>
                        <label htmlFor="forgot-email" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#717171', display: 'block', marginBottom: 2 }}>Registered Email</label>
                        <input
                          id="forgot-email"
                          autoComplete="email"
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#222222', background: '#ffffff', padding: 0 }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', padding: 14, background: 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 16 }}
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
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#222222' }}>Reset Link Sent</h2>
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
  const primaryGradient = 'linear-gradient(90deg, #E00B41 0%, #C8093A 100%)';
  const fieldLabel = { fontSize: 12, fontWeight: 700, color: '#595959', display: 'block', marginBottom: 4 };
  const fieldInput = { width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid #b0b0b0', borderRadius: 10, fontSize: 14, background: '#ffffff', color: '#222222' };
  const noticeColors = {
    info: { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' },
    success: { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
    error: { bg: '#fff8f6', fg: '#b42318', border: '#fecaca' },
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7f7f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', padding: '0 16px 60px', width: '100%', boxSizing: 'border-box' }}>

      {/* Host Bar */}
      <header style={{ maxWidth: 520, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72, borderBottom: '1px solid #ebebeb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: '#E00B41', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#222222' }}>Desk Manager</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/contact');
              setCurrentPage('contact');
            }}
            style={{ background: 'transparent', border: 'none', color: '#595959', padding: '7px 8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
          >
            Contact
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/');
              setCurrentPage('home');
            }}
            style={{ background: '#ffffff', border: '1px solid #dddddd', padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Home
          </button>
          {session && (
            <button
              type="button"
              onClick={handleLogout}
              style={{ background: 'transparent', border: 'none', color: '#595959', padding: '7px 8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              Log out
            </button>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 480, margin: '20px auto 0' }}>

        {!session && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: '40px 20px', border: '1px solid #ebebeb', textAlign: 'center' }}>
            <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 15 }}>You’re signed out. Sign in to manage your desk.</p>
            <button
              type="button"
              onClick={() => goToLogin('login')}
              style={{ background: primaryGradient, color: '#ffffff', border: 'none', padding: '12px 24px', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}
            >
              Sign In
            </button>
          </div>
        )}

        {session && (
          <>
            {/* Logged-in Host Profile Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff',
              borderRadius: 14,
              padding: '8px 14px',
              border: '1px solid #ebebeb',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              marginBottom: 12,
              fontSize: 11
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', flexShrink: 0 }} />
                <span style={{ fontWeight: 700, color: '#222222', whiteSpace: 'nowrap' }}>
                  {session.user?.user_metadata?.name || 'Host'}
                </span>
                <span style={{ color: '#d1d5db' }}>•</span>
                <span style={{ color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.user?.email}
                </span>
              </div>

              <div
                title={`Full ID: ${session.user?.id || ''}`}
                style={{
                  fontSize: 10,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  color: '#64748b',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '2px 6px',
                  borderRadius: 6,
                  flexShrink: 0,
                  marginLeft: 8,
                  cursor: 'default'
                }}
              >
                ID: {session.user?.id ? `${session.user.id.slice(0, 8)}...` : ''}
              </div>
            </div>

            {/* Token Balance Widget */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: 20,
              padding: '16px 20px',
              border: '1px solid #ebebeb',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#222222' }}>Remaining Calls</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  fontSize: 18,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: !deskReady || remainingTokens === null ? '#64748b' : remainingTokens <= 100 ? '#b42318' : '#067a0b',
                  backgroundColor: !deskReady || remainingTokens === null ? '#f1f5f9' : remainingTokens <= 100 ? '#fff8f6' : '#f0fdf4',
                  padding: '6px 12px',
                  borderRadius: 999,
                  minWidth: 44,
                  textAlign: 'center'
                }}>
                  {deskReady && remainingTokens !== null ? remainingTokens.toLocaleString('en-IN') : '...'}
                </div>
                <button
                  type="button"
                  onClick={openRecharge}
                  disabled={!deskReady}
                  style={{
                    background: primaryGradient,
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: deskReady ? 'pointer' : 'not-allowed',
                    opacity: deskReady ? 1 : 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(255, 56, 92, 0.25)'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Recharge
                </button>
              </div>
            </div>

            {/* Low balance warning */}
            {deskReady && isLowBalance && !isAccountBlocked && (
              <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '12px 16px', borderRadius: 14, fontSize: 13, marginBottom: 16 }}>
                <span>Only <strong>{remainingTokens}</strong> calls left. Recharge now so your desk doesn’t stop mid-clinic.</span>
                <button type="button" onClick={openRecharge} style={{ background: '#92400e', color: '#ffffff', border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  Recharge
                </button>
              </div>
            )}

            {deskReady && isAccountBlocked && (
              <div role="alert" style={{ backgroundColor: '#fff8f6', color: '#b42318', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 14, fontSize: 13, marginBottom: 16 }}>
                This account is paused, so calling is turned off. Please contact LiveQueue support on WhatsApp.
              </div>
            )}

            {adminError && (
              <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#fff8f6', color: '#b42318', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 14, fontSize: 13, marginBottom: 16 }}>
                <span>{adminError}</span>
                {deskFailed && (
                  <button type="button" onClick={() => loadDesk(session.user.id)} style={{ background: '#b42318', color: '#ffffff', border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    Retry
                  </button>
                )}
              </div>
            )}

            {!deskReady && !deskFailed && (
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: 24,
                padding: '48px 20px',
                border: '1px solid #ebebeb',
                textAlign: 'center',
                color: '#64748b',
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 16
              }}>
                Loading your desk…
              </div>
            )}

            {/* Counter Action Card */}
            {deskReady && (
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: 24,
                padding: '28px 20px',
                border: '1px solid #ebebeb',
                boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                textAlign: 'center',
                marginBottom: 16
              }}>
                {isEditing ? (
                  <form onSubmit={saveDetails} style={{ textAlign: 'left', marginBottom: 20 }}>
                    <div style={{ marginBottom: 12 }}>
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

                    <div style={{ marginBottom: 12 }}>
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

                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="edit-slug" style={fieldLabel}>Public Link</label>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #b0b0b0', borderRadius: 10, padding: '0 12px' }}>
                        <span style={{ color: '#595959', fontSize: 14 }}>/</span>
                        <input
                          id="edit-slug"
                          type="text"
                          autoCapitalize="none"
                          autoCorrect="off"
                          maxLength={60}
                          value={editSlug}
                          onChange={e => setEditSlug(e.target.value)}
                          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '10px 6px', fontSize: 14, background: '#ffffff', color: '#222222' }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>
                        English letters, numbers and hyphens. Will be saved as <strong>/{normalizeSlug(editSlug) || '…'}</strong>
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
                        onClick={cancelEditing}
                        style={{ padding: '11px 18px', background: '#f7f7f7', border: '1px solid #dddddd', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ marginBottom: 18 }}>
                    <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#222222', overflowWrap: 'anywhere' }}>
                      {queue.queue_title}
                    </h2>
                    <div style={{ color: '#595959', fontSize: 14, marginBottom: 8, overflowWrap: 'anywhere' }}>
                      {queue.queue_subtitle}
                    </div>
                    <button
                      type="button"
                      onClick={startEditing}
                      style={{ background: 'none', border: 'none', color: '#C8093A', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Edit name & link
                    </button>
                  </div>
                )}

                {/* Token Big Number Display */}
                <div style={{ padding: '20px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0', margin: '14px 0 20px' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#595959' }}>
                    Current Token
                  </span>
                  <div aria-live="polite" style={{ fontSize: '5rem', fontWeight: 900, lineHeight: 1.1, margin: '6px 0 0', color: '#222222', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', opacity: busy ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                    {queue.queue_position === 0 ? '—' : queue.queue_position}
                  </div>
                </div>

                {/* Calling Actions */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={previousQueue}
                    disabled={busy || queue.queue_position <= 0 || isAccountBlocked}
                    title="Go back one token (the call is refunded)"
                    style={{
                      flex: 1,
                      padding: 15,
                      fontSize: 15,
                      fontWeight: 600,
                      backgroundColor: busy || queue.queue_position <= 0 || isAccountBlocked ? '#f7f7f7' : '#ffffff',
                      color: busy || queue.queue_position <= 0 || isAccountBlocked ? '#a3a3a3' : '#222222',
                      border: '1px solid #dddddd',
                      borderRadius: 14,
                      cursor: busy || queue.queue_position <= 0 || isAccountBlocked ? 'not-allowed' : 'pointer'
                    }}
                  >
                    -1 Previous
                  </button>

                  <button
                    type="button"
                    onClick={isOutOfCalls && !isAccountBlocked ? openRecharge : advanceQueue}
                    disabled={busy || isAccountBlocked}
                    style={{
                      flex: 2,
                      padding: 15,
                      fontSize: 16,
                      fontWeight: 700,
                      background: isAccountBlocked ? '#e2e8f0' : isOutOfCalls ? '#222222' : primaryGradient,
                      color: isAccountBlocked ? '#64748b' : '#ffffff',
                      border: 'none',
                      borderRadius: 14,
                      cursor: busy ? 'wait' : isAccountBlocked ? 'not-allowed' : 'pointer',
                      boxShadow: isBlocked ? 'none' : '0 4px 14px rgba(255, 56, 92, 0.3)',
                      opacity: busy ? 0.75 : 1
                    }}
                  >
                    {isAccountBlocked ? 'Account Paused' : isOutOfCalls ? 'No calls left · Recharge' : busy ? 'Calling…' : '+1 Next Token'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={resetQueue}
                  disabled={busy || isAccountBlocked}
                  style={{ background: 'none', border: 'none', color: '#595959', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Reset count back to 0
                </button>
              </div>
            )}

            {/* Public Display Card */}
            {deskReady && (
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: 24,
                padding: '24px 20px',
                border: '1px solid #ebebeb',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#595959' }}>
                  Public Display Link
                </span>
                <div style={{ margin: '6px 0 16px', fontSize: 15, fontWeight: 700, overflowWrap: 'anywhere' }}>
                  <a href={currentPublicLink} target="_blank" rel="noreferrer" style={{ color: '#C8093A', textDecoration: 'none' }}>
                    {currentPublicLink.replace(/^https?:\/\//, '')}
                  </a>
                </div>

                {/* Render QR code */}
                <div style={{ display: 'inline-block', padding: 14, backgroundColor: '#ffffff', border: '1px solid #ebebeb', borderRadius: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                  <QRCodeSVG id="poster-qr-code" value={currentPublicLink} size={150} fgColor="#222222" level="H" />
                </div>

                {/* Action Buttons: TV Launch + Print/PDF Download */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                  <a
                    href={currentPublicLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block',
                      background: '#222222',
                      color: '#ffffff',
                      padding: '12px 20px',
                      borderRadius: 999,
                      textDecoration: 'none',
                      fontSize: 14,
                      fontWeight: 600
                    }}
                  >
                    Launch TV Display Screen ↗
                  </a>

                  <button
                    type="button"
                    onClick={handlePrintPoster}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: '#fff1f2',
                      color: '#C8093A',
                      border: '1.5px solid #fecdd3',
                      padding: '11px 20px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(255, 56, 92, 0.08)'
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Print Poster / Save as PDF
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* RECHARGE MODAL */}
      {isRechargeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recharge-title"
          onKeyDown={(e) => { if (e.key === 'Escape') closeRecharge(); }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000
          }}
        >
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: 24,
            maxWidth: 440,
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
            border: '1px solid #ebebeb',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div style={{ textAlign: 'left' }}>
                <h3 id="recharge-title" style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#222222', textAlign: 'left' }}>Recharge Calls</h3>
                <p style={{ fontSize: 12, color: '#595959', margin: '3px 0 0', textAlign: 'left' }}>Pick a pack. One call = one “+1 Next Token” tap.</p>
              </div>
              <button
                type="button"
                aria-label="Close recharge"
                onClick={closeRecharge}
                disabled={isProcessing}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#595959', cursor: isProcessing ? 'not-allowed' : 'pointer', padding: 4, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {packsError && (
              <div role="alert" style={{ backgroundColor: '#fff8f6', color: '#b42318', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 12, fontSize: 13, marginBottom: 12 }}>
                {packsError}
              </div>
            )}

            {!packs && !packsError && (
              <p style={{ fontSize: 13, color: '#595959', margin: '8px 0' }}>Loading packs…</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 16,
                    border: '1.5px solid #ebebeb',
                    backgroundColor: '#fafafa',
                    cursor: isProcessing ? 'wait' : 'pointer',
                    transition: 'all 0.15s ease',
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#222222' }}>
                        {pack.tokens.toLocaleString('en-IN')} Calls
                      </span>
                      {pack.tag && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#C8093A',
                          backgroundColor: '#ffeef1',
                          padding: '2px 8px',
                          borderRadius: 999
                        }}>
                          {pack.tag}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: '#595959', marginTop: 2, textAlign: 'left' }}>
                      {pack.name} Pack
                    </span>
                  </span>

                  <span style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: 17, fontWeight: 800, color: '#222222' }}>{formatInr(pack.price_paise)}</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#64748b' }}>One-time</span>
                  </span>
                </button>
              ))}
            </div>

            {isProcessing && !paymentNotice && (
              <p style={{ textAlign: 'center', fontSize: 13, color: '#C8093A', fontWeight: 600, margin: '14px 0 0' }}>
                Connecting to Razorpay…
              </p>
            )}

            {paymentNotice && (
              <div role="status" style={{ marginTop: 14, backgroundColor: noticeColors[paymentNotice.type].bg, color: noticeColors[paymentNotice.type].fg, border: `1px solid ${noticeColors[paymentNotice.type].border}`, padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.45 }}>
                {paymentNotice.text}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

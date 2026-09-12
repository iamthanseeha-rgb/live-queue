// One shared AudioContext for the whole page.
// Browsers (iOS Safari especially) only allow audio after a tap, and only for the
// context that was unlocked during that tap – so we create it once, unlock it on
// the first tap, and reuse it for every chime instead of creating a new one per call.

let ctx = null;

export function unlockSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    // Play one silent sample inside the gesture – required by iOS to fully unlock.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    return true;
  } catch (err) {
    console.warn('Sound unavailable:', err);
    return false;
  }
}

export function playChime() {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, t);
    osc.frequency.setValueAtTime(880.0, t + 0.12);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  } catch (err) {
    console.warn('Chime failed:', err);
  }
}

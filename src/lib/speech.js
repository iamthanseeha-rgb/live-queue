// Spoken token announcements for the public waiting-room screen.
//
// Two browser rules shape this file:
//  1. Speech is only allowed after a real user gesture (same as audio), so primeSpeech()
//     must be called from inside a click handler – not on page load.
//  2. getVoices() is empty on the first call in Chrome and fills in asynchronously,
//     so we listen for 'voiceschanged' and re-pick instead of caching the first answer.

let voice = null;
let primed = false;

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

// Prefer an Indian English voice, then any English voice, then whatever the device has.
function pickVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  return (
    voices.find((v) => v.lang === 'en-IN')
    || voices.find((v) => /^en[-_]IN/i.test(v.lang))
    || voices.find((v) => /hi[-_]IN/i.test(v.lang))     // Indian Hindi voices read English numbers well
    || voices.find((v) => /^en/i.test(v.lang) && v.localService)
    || voices.find((v) => /^en/i.test(v.lang))
    || voices[0]
    || null
  );
}

function refreshVoice() {
  const picked = pickVoice();
  if (picked) voice = picked;
}

if (speechSupported()) {
  refreshVoice();
  try {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoice);
  } catch {
    window.speechSynthesis.onvoiceschanged = refreshVoice;
  }
}

// Call this from inside the tap that turns sound on. Speaking one silent utterance
// during the gesture is what unlocks speech for the rest of the session on iOS.
export function primeSpeech() {
  if (!speechSupported()) return false;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    refreshVoice();
    primed = true;
    return true;
  } catch (err) {
    console.warn('Speech unavailable:', err);
    return false;
  }
}

export function isPrimed() {
  return primed;
}

let pending = null;

export function stopSpeaking() {
  if (pending) { clearTimeout(pending); pending = null; }
  if (!speechSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

// "Token number 15", said twice with a short gap – the pattern clinics and banks use
// so a patient who was mid-conversation still catches it.
// `delay` holds the announcement back so it doesn't overlap the chime. It is applied
// through the same single timer as everything else, so a number that arrives while an
// announcement is still waiting replaces it instead of queueing behind it.
export function announceToken(number, { repeat = 2, delay = 0 } = {}) {
  if (!speechSupported() || !primed) return;
  const n = Number(number);
  if (!Number.isFinite(n) || n <= 0) return;

  const speakOnce = () => {
    try {
      const synth = window.speechSynthesis;
      if (synth.paused) synth.resume();
      for (let i = 0; i < repeat; i += 1) {
        const u = new SpeechSynthesisUtterance(`Token number ${n}.`);
        u.lang = voice?.lang || 'en-IN';
        if (voice) u.voice = voice;
        u.rate = 0.85;   // slower than default: numbers matter more than speed here
        u.pitch = 1;
        u.volume = 1;
        synth.speak(u);
      }
    } catch (err) {
      console.warn('Announcement failed:', err);
    }
  };

  // Always announce the newest number only: cancel anything queued or waiting from a
  // rapid double-tap, so the screen never says "Token num—" and cuts to the next one.
  // The floor of 90ms is needed because cancel() and speak() in the same tick silently
  // drop the utterance in some Safari builds.
  stopSpeaking();
  pending = setTimeout(() => { pending = null; speakOnce(); }, Math.max(delay, 90));
}

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

// The Web Speech API exposes no gender field, so a male voice can only be chosen by
// name. These are the male and female voices actually shipped by Windows, Android,
// iOS/macOS and Chrome — matched by name, with "male"/"female" in the name winning
// outright when an engine states it.
const MALE_NAMES = /\b(rishi|ravi|prabhat|madhur|hemant|daniel|alex|aaron|fred|george|guy|mark|david|eric|christopher|roger|steffan|thomas|oliver|liam|arthur|james|ryan|brian|tom|xander|male)\b/i;
const FEMALE_NAMES = /\b(heera|neerja|swara|kalpana|veena|lekha|samantha|karen|moira|tessa|fiona|victoria|allison|ava|susan|zira|hazel|linda|catherine|aria|jenny|michelle|ana|emma|amy|sonia|libby|natasha|clara|female)\b/i;

// Higher is better. Male first, then an Indian English accent, then anything English.
function scoreVoice(v) {
  const name = v.name || '';
  const lang = v.lang || '';
  let s = 0;

  if (/\bfemale\b/i.test(name)) s -= 100;
  else if (/\bmale\b/i.test(name)) s += 100;

  if (FEMALE_NAMES.test(name)) s -= 60;
  else if (MALE_NAMES.test(name)) s += 60;

  if (/^en[-_]IN/i.test(lang)) s += 30;
  else if (/^en[-_]GB/i.test(lang)) s += 14;
  else if (/^en/i.test(lang)) s += 10;
  else if (/^hi[-_]IN/i.test(lang)) s += 6;   // Indian Hindi voices read English numerals well
  else s -= 40;                                // a non-English voice mangles "Token number"

  if (v.localService) s += 4;                  // offline: no lag, no network dependency
  return s;
}

function pickVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  return voices.reduce((best, v) => (scoreVoice(v) > scoreVoice(best) ? v : best), voices[0]);
}

// Exposed so the UI can tell the clinic which voice their device ended up using.
export function currentVoiceName() {
  return voice?.name || null;
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

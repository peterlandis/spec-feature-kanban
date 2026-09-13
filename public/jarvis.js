/**
 * CORE-018 Jarvis HUD on Graph. Push-to-talk latch. Transcript stays in this tab.
 */
(function initJarvis() {
  const STORAGE_ON = 'jarvisEnabled';
  const STORAGE_VOICE = 'jarvisVoice';
  const STORAGE_VOICE_ID = 'jarvisVoiceId';

  const hud = document.getElementById('jarvisHud');
  const toggle = document.getElementById('toggleJarvis');
  const talk = document.getElementById('jarvisTalk');
  const stateEl = document.getElementById('jarvisState');
  const messagesEl = document.getElementById('jarvisMessages');
  const form = document.getElementById('jarvisForm');
  const input = document.getElementById('jarvisInput');
  const clock = document.getElementById('jarvisClock');
  const confirmBox = document.getElementById('jarvisConfirm');
  const confirmText = document.getElementById('jarvisConfirmText');
  const enablePref = document.getElementById('jarvisEnablePref');
  const voicePref = document.getElementById('jarvisVoicePref');
  const voiceSelect = document.getElementById('jarvisVoiceSelect');
  const voicePreview = document.getElementById('jarvisVoicePreview');
  const cardStatus = document.getElementById('jarvisCardStatus');
  const sourceEl = document.getElementById('jarvisSource');

  if (!hud || !toggle) return;

  let voiceOn = localStorage.getItem(STORAGE_VOICE) !== '0';
  let enabled = localStorage.getItem(STORAGE_ON) === '1';

  function currentVoiceId() {
    if (voiceSelect && voiceSelect.value) return voiceSelect.value;
    const fromConfig = window.jarvisVoiceConfig && window.jarvisVoiceConfig.voiceId;
    return localStorage.getItem(STORAGE_VOICE_ID) || fromConfig || 'local:daniel';
  }
  let listening = false;
  let recognition = null;
  let pendingConfirm = null;
  let currentAudio = null;
  let cachedBrowserVoice = null;
  let speakGeneration = 0;
  const thread = [];
  const PREVIEW_LINE = 'At your service. All systems are online. How may I assist you?';

  function toJarvisSpeech(text) {
    let spoken = String(text || '').replace(/\[\[.*?\]\]/g, ' ').trim();
    if (!spoken) return '';
    spoken = spoken.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ');
    spoken = spoken.replace(/\b(CORE|AGENT)-(\d{3})\b/gi, (_, kind, digits) => {
      const name = String(kind).toUpperCase() === 'AGENT' ? 'Agent' : 'Core';
      const n = Number(digits);
      return Number.isFinite(n) ? `${name} ${n}` : `${name} ${digits}`;
    });
    return spoken
      .replace(/WorkInProgress/g, 'work in progress')
      .replace(/ReadyToMerge/g, 'ready to merge')
      .replace(/PlanReview/g, 'plan review')
      .replace(/—/g, '. ')
      .replace(/\s+\./g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function SpeechCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function setState(text, mode) {
    if (stateEl) stateEl.textContent = text;
    hud.dataset.mode = mode || 'idle';
    if (talk) talk.setAttribute('aria-pressed', String(mode === 'listening'));
  }

  function stopSpeech() {
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.onplaying = null;
      try { currentAudio.pause(); } catch (_) { /* ignore */ }
      if (currentAudio.src && currentAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudio.src);
      }
      try { currentAudio.removeAttribute('src'); } catch (_) { /* ignore */ }
      currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function pickJarvisBrowserVoice() {
    if (!window.speechSynthesis) return null;
    if (cachedBrowserVoice && window.speechSynthesis.getVoices().includes(cachedBrowserVoice)) {
      return cachedBrowserVoice;
    }
    const voices = window.speechSynthesis.getVoices() || [];
    const ranked = voices.map((voice) => {
      const name = String(voice.name || '');
      const lang = String(voice.lang || '');
      let score = 0;
      if (/google uk english male/i.test(name)) score = 100;
      else if (/^daniel/i.test(name) && /en-?GB/i.test(lang)) score = 95;
      else if (/daniel/i.test(name)) score = 90;
      else if (/reed/i.test(name) && /en-?GB/i.test(lang)) score = 80;
      else if (/arthur|oliver|rishi|uk english male/i.test(name)) score = 70;
      else if (/en-?GB/i.test(lang) && !/female|moira|martha|serena|kate|flo|grandma|sandy|shelley/i.test(name)) score = 55;
      else if (/en-?GB/i.test(lang)) score = 40;
      return { voice, score };
    }).filter((row) => row.score > 0);
    ranked.sort((a, b) => b.score - a.score);
    cachedBrowserVoice = ranked[0] ? ranked[0].voice : null;
    return cachedBrowserVoice;
  }

  function speakBrowser(spoken) {
    if (!window.speechSynthesis || !spoken) {
      setState('Idle — click the orb to talk, or type below.', 'idle');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = 'en-GB';
    utterance.rate = 0.96;
    utterance.pitch = 0.88;
    const voice = pickJarvisBrowserVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setState('Speaking…', 'speaking');
    utterance.onend = () => setState('Idle — click the orb to talk, or type below.', 'idle');
    utterance.onerror = () => setState('Idle — click the orb to talk, or type below.', 'idle');
    window.speechSynthesis.speak(utterance);
  }

  function releaseAudio(url) {
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.onplaying = null;
      try { currentAudio.removeAttribute('src'); } catch (_) { /* ignore */ }
    }
    if (url) URL.revokeObjectURL(url);
    currentAudio = null;
  }

  async function speak(text, options = {}) {
    if (!voiceOn) return;
    const spoken = toJarvisSpeech(text);
    if (!spoken) return;
    const voiceId = currentVoiceId();
    const gen = ++speakGeneration;
    stopSpeech();
    setState('Speaking…', 'speaking');
    if (String(voiceId).startsWith('browser:')) {
      if (sourceEl) sourceEl.textContent = 'browser voice';
      speakBrowser(spoken);
      return;
    }
    try {
      const res = await fetch('/api/jarvis/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId, natural: !!options.natural }),
      });
      if (res.ok) {
        if (sourceEl) {
          const engine = res.headers.get('X-Jarvis-Engine');
          sourceEl.textContent = engine === 'openai'
            ? 'openai voice'
            : engine === 'grok'
              ? 'grok voice'
              : 'graph snapshot';
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        let playbackStarted = false;
        currentAudio = new Audio(url);
        currentAudio.onplaying = () => {
          playbackStarted = true;
        };
        currentAudio.onended = () => {
          releaseAudio(url);
          if (gen === speakGeneration) {
            setState('Idle — click the orb to talk, or type below.', 'idle');
          }
        };
        currentAudio.onerror = () => {
          const started = playbackStarted;
          releaseAudio(url);
          if (gen !== speakGeneration) return;
          if (started) {
            setState('Idle — click the orb to talk, or type below.', 'idle');
            return;
          }
          speakBrowser(spoken);
        };
        try {
          await currentAudio.play();
          return;
        } catch (_) {
          releaseAudio(url);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setState(data.error || 'This voice needs setup in Settings → Jarvis.', 'idle');
        return;
      }
    } catch (_) {
      /* use browser voice */
    }
    if (gen === speakGeneration) speakBrowser(spoken);
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      cachedBrowserVoice = null;
      pickJarvisBrowserVoice();
    });
    pickJarvisBrowserVoice();
  }

  function addMessage(role, text) {
    if (!messagesEl) return;
    const row = document.createElement('div');
    row.className = `jarvis-line is-${role}`;
    row.textContent = (role === 'user' ? '$ ' : '') + text;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideConfirm() {
    pendingConfirm = null;
    if (confirmBox) confirmBox.hidden = true;
  }

  function showConfirm(confirm) {
    pendingConfirm = confirm;
    if (confirmText) confirmText.textContent = `Confirm ${confirm.label}? This spends Cursor usage.`;
    if (confirmBox) confirmBox.hidden = false;
  }

  async function ask(text) {
    const content = String(text || '').trim();
    if (!content) return;
    hideConfirm();
    stopSpeech();
    addMessage('user', content);
    thread.push({ role: 'user', content });
    setState('Thinking…', 'thinking');
    const snapshot = typeof jarvisSnapshot === 'function' ? jarvisSnapshot() : { features: [], graph: { edges: [] } };
    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: thread.slice(-12),
          features: snapshot.features,
          graph: snapshot.graph,
          voiceId: currentVoiceId(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Jarvis could not answer.');
      const reply = data.reply || 'No answer from the snapshot.';
      thread.push({ role: 'assistant', content: reply });
      addMessage('assistant', reply);
      if (typeof jarvisHighlight === 'function') jarvisHighlight(data.mentionIds || []);
      if (data.confirm) showConfirm(data.confirm);
      if (sourceEl) {
        sourceEl.textContent = data.source === 'openai'
          ? 'openai brief'
          : data.source === 'grok'
            ? 'grok brief'
            : 'graph snapshot';
      }
      setState('Idle — click the orb to talk, or type below.', 'idle');
      speak(reply, { natural: data.source === 'openai' || data.source === 'grok' });
    } catch (err) {
      const message = err.message || 'Jarvis failed.';
      addMessage('assistant', message);
      setState('Idle — click the orb to talk, or type below.', 'idle');
    }
  }

  function stopListening() {
    listening = false;
    if (recognition) {
      try { recognition.stop(); } catch (_) { /* ignore */ }
    }
    setState('Idle — click the orb to talk, or type below.', 'idle');
  }

  function startListening() {
    const Ctor = SpeechCtor();
    if (!Ctor) {
      setState('Voice input is not supported in this browser. Type instead.', 'idle');
      return;
    }
    stopSpeech();
    recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const said = event.results && event.results[0] && event.results[0][0]
        ? event.results[0][0].transcript
        : '';
      stopListening();
      ask(said);
    };
    recognition.onerror = (event) => {
      stopListening();
      if (event.error === 'not-allowed') {
        setState('Mic blocked. Text Jarvis still works.', 'idle');
      } else {
        setState('Listening stopped. Type instead if needed.', 'idle');
      }
    };
    recognition.onend = () => {
      if (listening) stopListening();
    };
    listening = true;
    try {
      recognition.start();
      setState('Listening…', 'listening');
    } catch (_) {
      stopListening();
      setState('Could not start the mic. Type instead.', 'idle');
    }
  }

  function applyEnabled() {
    localStorage.setItem(STORAGE_ON, enabled ? '1' : '0');
    hud.hidden = !enabled;
    toggle.classList.toggle('is-active', enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    if (enablePref) enablePref.checked = enabled;
    if (cardStatus) cardStatus.textContent = enabled ? 'On' : 'Off';
    if (!enabled) {
      stopListening();
      stopSpeech();
    }
  }

  function tickClock() {
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString();
  }

  window.syncJarvis = function syncJarvis() {
    applyEnabled();
    if (voicePref) voicePref.checked = voiceOn;
    const voiceId = (window.jarvisVoiceConfig && window.jarvisVoiceConfig.voiceId) || currentVoiceId();
    localStorage.setItem(STORAGE_VOICE_ID, voiceId);
    if (voiceSelect && voiceId) voiceSelect.value = voiceId;
  };

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    applyEnabled();
  });
  enablePref?.addEventListener('change', () => {
    enabled = !!enablePref.checked;
    applyEnabled();
  });
  voicePref?.addEventListener('change', () => {
    voiceOn = !!voicePref.checked;
    localStorage.setItem(STORAGE_VOICE, voiceOn ? '1' : '0');
    if (!voiceOn) stopSpeech();
  });
  voicePreview?.addEventListener('click', () => {
    if (!voiceOn) {
      voiceOn = true;
      localStorage.setItem(STORAGE_VOICE, '1');
      if (voicePref) voicePref.checked = true;
    }
    speak(PREVIEW_LINE);
  });
  talk?.addEventListener('click', () => {
    if (listening) stopListening();
    else startListening();
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    ask(value);
  });
  document.getElementById('jarvisConfirmCancel')?.addEventListener('click', () => {
    hideConfirm();
    addMessage('assistant', 'Cancelled. No agent started.');
  });
  document.getElementById('jarvisConfirmOk')?.addEventListener('click', async () => {
    const confirm = pendingConfirm;
    hideConfirm();
    if (!confirm || typeof jarvisExecuteConfirm !== 'function') return;
    try {
      await jarvisExecuteConfirm(confirm.action, confirm.featureId);
      addMessage('assistant', `Confirmed ${confirm.label}.`);
    } catch (err) {
      addMessage('assistant', err.message || 'Confirm failed.');
    }
  });

  setInterval(tickClock, 1000);
  tickClock();
  applyEnabled();
})();

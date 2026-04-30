export function canUseSpeechRecognition(environment = globalThis) {
  return typeof findSpeechRecognitionConstructor(environment) === 'function';
}

export function canUseSpeechSynthesis(environment = globalThis) {
  return Boolean(
    environment?.speechSynthesis
      && typeof environment.speechSynthesis.speak === 'function'
      && typeof environment.SpeechSynthesisUtterance === 'function',
  );
}

export function describeVoiceAvailability(environment = globalThis) {
  return {
    speechRecognition: canUseSpeechRecognition(environment),
    speechSynthesis: canUseSpeechSynthesis(environment),
  };
}

export function listenForSpeech({
  environment = globalThis,
  language = 'zh-CN',
  continuous = false,
  interimResults = false,
} = {}) {
  const SpeechRecognition = findSpeechRecognitionConstructor(environment);
  if (typeof SpeechRecognition !== 'function') {
    return Promise.reject(new Error('Speech recognition is not available in this runtime.'));
  }

  return new Promise((resolve, reject) => {
    const recognition = new SpeechRecognition();
    let transcript = '';
    let settled = false;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.onresult = (event) => {
      transcript = collectTranscript(event);
      if (hasFinalResult(event) && transcript) {
        settle(resolve, transcript);
        recognition.stop?.();
      }
    };
    recognition.onerror = (event) => {
      const reason = event?.error ? `Speech recognition failed: ${event.error}` : 'Speech recognition failed.';
      settle(reject, new Error(reason));
    };
    recognition.onend = () => {
      settle(resolve, transcript.trim());
    };
    recognition.start();
  });
}

export function speakText(text, {
  environment = globalThis,
  language = 'zh-CN',
  rate = 1,
  pitch = 1,
} = {}) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return Promise.reject(new Error('Nothing to read aloud.'));
  }
  if (!canUseSpeechSynthesis(environment)) {
    return Promise.reject(new Error('Speech playback is not available in this runtime.'));
  }

  return new Promise((resolve, reject) => {
    const utterance = new environment.SpeechSynthesisUtterance(trimmed);
    utterance.lang = language;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      const reason = event?.error ? `Speech playback failed: ${event.error}` : 'Speech playback failed.';
      reject(new Error(reason));
    };
    environment.speechSynthesis.cancel?.();
    environment.speechSynthesis.speak(utterance);
  });
}

function findSpeechRecognitionConstructor(environment) {
  return environment?.SpeechRecognition ?? environment?.webkitSpeechRecognition;
}

function collectTranscript(event) {
  return Array.from(event?.results ?? [])
    .map((result) => result?.[0]?.transcript ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasFinalResult(event) {
  return Array.from(event?.results ?? []).some((result) => Boolean(result?.isFinal));
}

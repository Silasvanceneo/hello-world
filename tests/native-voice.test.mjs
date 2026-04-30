import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canUseSpeechRecognition,
  canUseSpeechSynthesis,
  describeVoiceAvailability,
  listenForSpeech,
  speakText,
} from '../apps/web/src/native-voice.js';

test('voice capability predicates detect speech APIs', () => {
  function SpeechRecognition() {}
  function SpeechSynthesisUtterance() {}

  const environment = {
    SpeechRecognition,
    SpeechSynthesisUtterance,
    speechSynthesis: { speak() {} },
  };

  assert.equal(canUseSpeechRecognition(environment), true);
  assert.equal(canUseSpeechRecognition({}), false);
  assert.equal(canUseSpeechSynthesis(environment), true);
  assert.equal(canUseSpeechSynthesis({ speechSynthesis: {} }), false);
  assert.deepEqual(describeVoiceAvailability(environment), {
    speechRecognition: true,
    speechSynthesis: true,
  });
});

test('listenForSpeech resolves final transcript and configures recognition', async () => {
  let instance;
  class MockSpeechRecognition {
    constructor() {
      instance = this;
    }

    start() {
      this.onresult({
        results: [
          { 0: { transcript: 'hello' }, isFinal: true },
          { 0: { transcript: 'world' }, isFinal: true },
        ],
      });
    }

    stop() {
      this.stopped = true;
    }
  }

  const transcript = await listenForSpeech({
    environment: { webkitSpeechRecognition: MockSpeechRecognition },
    language: 'en-US',
    continuous: true,
    interimResults: true,
  });

  assert.equal(transcript, 'hello world');
  assert.equal(instance.lang, 'en-US');
  assert.equal(instance.continuous, true);
  assert.equal(instance.interimResults, true);
  assert.equal(instance.stopped, true);
});

test('speakText speaks an utterance and resolves when playback ends', async () => {
  const spoken = [];
  class MockSpeechSynthesisUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  await speakText(' Read this ', {
    environment: {
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
      speechSynthesis: {
        cancel() {
          spoken.push('cancel');
        },
        speak(utterance) {
          spoken.push(utterance.text);
          utterance.onend();
        },
      },
    },
    language: 'en-US',
    rate: 1.2,
    pitch: 0.9,
  });

  assert.deepEqual(spoken, ['cancel', 'Read this']);
});

test('voice helpers reject when runtime support or text is missing', async () => {
  await assert.rejects(() => listenForSpeech({ environment: {} }), /Speech recognition is not available/);
  await assert.rejects(() => speakText('', { environment: {} }), /Nothing to read aloud/);
  await assert.rejects(() => speakText('hello', { environment: {} }), /Speech playback is not available/);
});

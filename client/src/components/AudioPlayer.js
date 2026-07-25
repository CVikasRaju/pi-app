'use client';

import { useState, useEffect } from 'react';

/**
 * AudioPlayer — Text-to-Speech playback button for AI answers
 *
 * Props:
 *   text       - Text string to be spoken
 *   language   - 'en' | 'kn'
 */
export default function AudioPlayer({ text, language = 'en' }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function handleSpeak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'kn' ? 'kn-IN' : 'en-IN';
    utterance.rate = 0.95;

    // Pick suitable voice if available
    const voices = window.speechSynthesis.getVoices();
    const targetLang = language === 'kn' ? 'kn' : 'en';
    const matchedVoice = voices.find(v => v.lang.startsWith(targetLang));
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend   = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.cancel(); // Stop any ongoing speech
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button
      type="button"
      className={`btn-tts ${speaking ? 'btn-tts-speaking' : ''}`}
      onClick={handleSpeak}
      title={speaking ? 'Stop speech' : 'Listen to answer'}
      aria-label="Listen to response"
    >
      <span className="tts-icon">{speaking ? '🔊' : '🔈'}</span>
      <span className="tts-label">{speaking ? 'Stop' : 'Listen'}</span>
    </button>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * VoiceRecorder — Speech-to-Text microphone recording component
 *
 * Props:
 *   language       - 'en' | 'kn'
 *   onTranscript   - function(text) callback when speech is recognized
 *   disabled       - boolean
 */
export default function VoiceRecorder({ language = 'en', onTranscript, disabled }) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef(null);

  // Initialize SpeechRecognition browser API
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language === 'kn' ? 'kn-IN' : 'en-IN';

      recognition.onresult = (event) => {
        let final = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (interim) setInterimText(interim);
        if (final) {
          setInterimText('');
          onTranscript?.(final);
          setIsRecording(false);
        }
      };

      recognition.onerror = (err) => {
        console.warn('[VoiceRecorder] Speech error:', err.error);
        setIsRecording(false);
        setInterimText('');
      };

      recognition.onend = () => {
        setIsRecording(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
    }
  }, [language, onTranscript]);

  function toggleRecording() {
    if (disabled) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setInterimText('');
    } else {
      if (!recognitionRef.current) {
        alert('Speech recognition is not supported in this browser. Please use Chrome/Edge or type your question.');
        return;
      }
      try {
        recognitionRef.current.lang = language === 'kn' ? 'kn-IN' : 'en-IN';
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.warn('[VoiceRecorder] Start error:', err);
      }
    }
  }

  return (
    <div className="voice-recorder-wrapper">
      <button
        type="button"
        className={`btn-mic ${isRecording ? 'btn-mic-recording' : ''}`}
        onClick={toggleRecording}
        disabled={disabled}
        title={isRecording ? 'Stop listening' : `Speak in ${language === 'kn' ? 'Kannada' : 'English'}`}
        aria-label="Voice input"
      >
        <span className="mic-icon">{isRecording ? '⏹' : '🎙️'}</span>
        {isRecording && <span className="mic-pulse-ring" />}
      </button>

      {isRecording && interimText && (
        <div className="mic-live-preview">
          <span className="mic-live-dot" />
          <span className="mic-live-text">{interimText}</span>
        </div>
      )}
    </div>
  );
}

/**
 * /chat — Full-screen conversational intelligence page (Phase 2 Multilingual & Voice)
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute      from '../../components/ProtectedRoute';
import ChatMessage         from '../../components/ChatMessage';
import TypingIndicator     from '../../components/TypingIndicator';
import RoleBadge           from '../../components/RoleBadge';
import LanguageToggle      from '../../components/LanguageToggle';
import VoiceRecorder       from '../../components/VoiceRecorder';
import { sendMessage, getHistory, clearSession, exportPdf } from '../../lib/chatApi';
import { logout }          from '../../lib/catalystAuth';

export default function ChatPage() {
  return (
    <ProtectedRoute>
      {({ user }) => <ChatUI user={user} />}
    </ProtectedRoute>
  );
}

function ChatUI({ user }) {
  const router = useRouter();

  // Active session & language preference
  const [sessionId,       setSessionId]      = useState(null);
  const [messages,        setMessages]       = useState([]);
  const [isTyping,        setIsTyping]       = useState(false);
  const [inputText,       setInputText]      = useState('');
  const [language,        setLanguage]       = useState('en');
  const [sendError,       setSendError]      = useState('');
  const [exporting,       setExporting]      = useState(false);

  // Session sidebar
  const [sessions,        setSessions]       = useState([]);
  const [sidebarOpen,     setSidebarOpen]    = useState(true);
  const [loadingHistory,  setLoadingHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // Load language preference from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('pi_app_lang');
      if (saved) setLanguage(saved);
    }
  }, []);

  function handleLanguageChange(newLang) {
    setLanguage(newLang);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pi_app_lang', newLang);
    }
  }

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Send message
  const handleSend = useCallback(async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    setSendError('');
    setInputText('');
    setIsTyping(true);

    const userMsg = {
      message_id: `user-${Date.now()}`,
      role:       'user',
      question:   text,
      language,
      timestamp:  new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await sendMessage(text, sessionId, language);

      if (!sessionId && response.session_id) {
        setSessionId(response.session_id);
        setSessions(prev => [
          { id: response.session_id, label: text.slice(0, 40), timestamp: new Date().toISOString() },
          ...prev,
        ]);
      }

      setMessages(prev => [...prev, { ...response, role: 'assistant' }]);

    } catch (err) {
      setSendError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  }, [inputText, isTyping, sessionId, language]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleNewChat() {
    if (sessionId) {
      await clearSession(sessionId).catch(() => {});
    }
    setSessionId(null);
    setMessages([]);
    setSendError('');
    inputRef.current?.focus();
  }

  async function handleLoadSession(sid) {
    if (sid === sessionId) return;
    setLoadingHistory(true);
    setMessages([]);
    setSessionId(sid);

    try {
      const hist = await getHistory(sid);
      const loaded = [];
      for (const turn of hist.turns || []) {
        loaded.push({
          message_id: `user-${turn.turn_id}`,
          role:       'user',
          question:   turn.question,
          language:   turn.language || 'en',
          timestamp:  turn.timestamp,
        });
        loaded.push({
          message_id:         turn.turn_id,
          role:               'assistant',
          answer:             turn.answer,
          sources:            turn.sources || [],
          no_results:         turn.no_results,
          confidence:         turn.confidence,
          intent:             turn.intent,
          language:           turn.language || 'en',
          show_sources_panel: (turn.sources || []).length > 0 || turn.no_results,
          sources_label:      (turn.sources || []).length > 0
            ? `${turn.sources.length} source${turn.sources.length > 1 ? 's' : ''} cited`
            : (turn.no_results ? 'No records found' : ''),
          timestamp:          turn.timestamp,
        });
      }
      setMessages(loaded);
    } catch (err) {
      setSendError('Failed to load session history.');
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleExport() {
    if (!sessionId || exporting) return;
    setExporting(true);
    try {
      const blob = await exportPdf(sessionId, `PI App — Conversation ${sessionId.slice(0, 8)}`);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `pi-app-${sessionId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSendError(err.message || 'PDF export failed.');
    } finally {
      setExporting(false);
    }
  }

  const SUGGESTIONS = {
    en: [
      'How many FIRs were registered this year?',
      'Show me all chargesheeted cases from 2024',
      'What is the status of case CR-001/2024?',
      'Give me a breakdown of FIRs by category',
    ],
    kn: [
      'ಈ ವರ್ಷ ಎಷ್ಟು ಎಫ್‌ಐಆರ್‌ಗಳು ದಾಖಲಾಗಿವೆ?',
      '2024 ರ ಚಾರ್ಜ್‌ಶೀಟ್ ಆದ ಪ್ರಕರಣಗಳನ್ನು ತೋರಿಸಿ',
      'CR-001/2024 ಪ್ರಕರಣದ ಸ್ಥಿತಿ ಏನು?',
      'ವರ್ಗೀಕರಣದ ಆಧಾರದ ಮೇಲೆ ಎಫ್‌ಐಆರ್ ವಿವರ ನೀಡಿ',
    ],
  };

  const currentSuggestions = SUGGESTIONS[language] || SUGGESTIONS.en;
  const canExport = user.role !== 'policymaker' && sessionId && messages.length > 0;

  return (
    <div className="chat-page" id="chat-page">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="app-header" id="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            id="chat-sidebar-toggle"
            className="btn btn-ghost"
            style={{ padding: '8px 10px', fontSize: '1rem' }}
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <div>
            <div className="app-logo">PI App</div>
            <div className="app-logo-sub">Intelligence Chat</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Language Switch */}
          <LanguageToggle language={language} onLanguageChange={handleLanguageChange} />
          <RoleBadge role={user.role} size="sm" />
          <button
            id="chat-back-btn"
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
            onClick={() => router.push('/dashboard')}
          >
            ← Dashboard
          </button>
          <button
            id="chat-logout-btn"
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="chat-body">

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="chat-sidebar glass-card" id="chat-sidebar">
            <button
              id="new-chat-btn"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '16px' }}
              onClick={handleNewChat}
            >
              + {language === 'kn' ? 'ಹೊಸ ಸಂಭಾಷಣೆ' : 'New Chat'}
            </button>

            <p className="sidebar-section-label">{language === 'kn' ? 'ಇತ್ತೀಚಿನ ಸಂಭಾಷಣೆಗಳು' : 'Recent sessions'}</p>

            {sessions.length === 0 ? (
              <p className="sidebar-empty">
                {language === 'kn' ? 'ಯಾವುದೇ ಸಂಭಾಷಣೆಗಳಿಲ್ಲ. ಪ್ರಶ್ನೆಯನ್ನು ಕೇಳಿ ಪ್ರಾರಂಭಿಸಿ.' : 'No sessions yet. Ask a question to start.'}
              </p>
            ) : (
              <ul className="session-list">
                {sessions.map(s => (
                  <li key={s.id}>
                    <button
                      className={`session-item ${s.id === sessionId ? 'session-item-active' : ''}`}
                      onClick={() => handleLoadSession(s.id)}
                    >
                      <span className="session-label">{s.label || s.id.slice(0, 20)}</span>
                      <span className="session-time">
                        {s.timestamp ? new Date(s.timestamp).toLocaleDateString('en-IN') : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {/* Main chat panel */}
        <main className="chat-main" id="chat-main">

          {/* Message thread */}
          <div className="chat-thread" id="chat-thread" role="log" aria-live="polite">
            {messages.length === 0 && !isTyping ? (
              /* Empty state */
              <div className="chat-empty-state" id="chat-empty-state">
                <div className="chat-empty-emblem">🔍</div>
                <h2 className="chat-empty-title">
                  {language === 'kn' ? 'ಅಪರಾಧ ಬುದ್ಧಿವಂತಿಕೆ ಸಂಭಾಷಣೆ' : 'Intelligence Chat'}
                </h2>
                <p className="chat-empty-sub">
                  {language === 'kn'
                    ? 'ಎಫ್‌ಐಆರ್, ಆರೋಪಿಗಳು, ಸಂತ್ರಸ್ತರು ಮತ್ತು ಅಪರಾಧ ಅಂಕಿಅಂಶಗಳ ಕುರಿತು ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಿ. ಪ್ರತಿಯೊಂದು ಉತ್ತರಕ್ಕೂ ಆಧಾರ ಸೂಚಿಸಲಾಗುತ್ತದೆ.'
                    : 'Ask questions about FIRs, accused, victims, and case statistics in English or Kannada. Every answer is grounded in your case data and cites its sources.'}
                </p>
                <div className="suggestions-grid">
                  {currentSuggestions.map((s, i) => (
                    <button
                      key={i}
                      className="suggestion-chip"
                      onClick={() => { setInputText(s); inputRef.current?.focus(); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {user.role === 'policymaker' && (
                  <div className="policymaker-notice" style={{ marginTop: '24px', maxWidth: '480px' }}>
                    <span>📋</span>
                    <span>Your role provides aggregate-only insights. Individual case details and personal information are not accessible.</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={msg.message_id || i}
                    message={msg}
                    isLast={i === messages.length - 1}
                  />
                ))}
                {isTyping && (
                  <div className="chat-row chat-row-ai">
                    <div className="chat-avatar-ai">🔍</div>
                    <TypingIndicator />
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error banner */}
          {sendError && (
            <div className="login-error-banner" id="chat-error" style={{ margin: '0 24px 12px' }}>
              <span>⚠️</span> {sendError}
              <button
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                onClick={() => setSendError('')}
              >✕</button>
            </div>
          )}

          {/* Input bar */}
          <div className="chat-input-bar" id="chat-input-bar">
            {/* Voice Recorder microphone button */}
            <VoiceRecorder
              language={language}
              onTranscript={(spokenText) => {
                setInputText(spokenText);
                handleSend(spokenText);
              }}
              disabled={isTyping}
            />

            <textarea
              id="chat-input"
              ref={inputRef}
              className="chat-input"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                language === 'kn'
                  ? 'ಎಫ್‌ಐಆರ್, ಆರೋಪಿಗಳು ಅಥವಾ ಅಂಕಿಅಂಶಗಳ ಬಗ್ಗೆ ಕೇಳಿ... (Enter)'
                  : 'Ask about FIRs, cases, accused, or statistics… (Enter to send)'
              }
              rows={1}
              disabled={isTyping}
              aria-label="Chat input"
            />

            <button
              id="chat-send-btn"
              className="btn btn-primary chat-send-btn"
              onClick={() => handleSend()}
              disabled={!inputText.trim() || isTyping}
              aria-label="Send message"
            >
              {isTyping ? <span className="btn-spinner" /> : '↑'}
            </button>

            {canExport && (
              <button
                id="chat-export-btn"
                className="btn btn-ghost"
                style={{ padding: '10px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                onClick={handleExport}
                disabled={exporting}
                title="Export conversation as PDF"
              >
                {exporting ? '…' : '⬇ PDF'}
              </button>
            )}
          </div>

          <p className="chat-footer-note">
            {language === 'kn'
              ? 'ಎಲ್ಲಾ ಪ್ರಶ್ನೆಗಳನ್ನು ದಾಖಲಿಸಲಾಗುತ್ತದೆ. ದತ್ತಸಂಚಯದ ಆಧಾರದೊಂದಿಗೆ ಉತ್ತರ ನೀಡಲಾಗುತ್ತದೆ.'
              : 'All queries are logged. Answers are grounded in database records and cite their sources.'}
          </p>
        </main>
      </div>
    </div>
  );
}

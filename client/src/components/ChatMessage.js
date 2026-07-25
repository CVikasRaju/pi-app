'use client';

import SourcesPanel    from './SourcesPanel';
import ReasoningPanel  from './ReasoningPanel';
import AudioPlayer     from './AudioPlayer';

/**
 * ChatMessage — renders a single conversation turn (Phase 2 Multilingual & Audio)
 */

function formatTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

export default function ChatMessage({ message, isLast }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className={`chat-row chat-row-user ${isLast ? 'chat-row-last' : ''}`}>
        <div className="chat-bubble-user" id={`msg-user-${message.message_id || ''}`}>
          <p className="chat-bubble-text">{message.question || message.answer}</p>
          <span className="chat-bubble-time">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className={`chat-row chat-row-ai ${isLast ? 'chat-row-last' : ''}`}>
      <div className="chat-avatar-ai" aria-hidden="true">🔍</div>

      <div className="chat-ai-body">
        {/* Main answer card */}
        <div
          className="chat-bubble-ai glass-card"
          id={`msg-ai-${message.message_id || ''}`}
        >
          {/* Top header row with Audio player */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {message.language === 'kn' ? 'ಕರ್ನಾಟಕ ಸಿಆರ್‌ಬಿ ಸಹಾಯಕ' : 'Intelligence Assistant'}
            </span>
            <AudioPlayer text={message.answer} language={message.language || 'en'} />
          </div>

          {/* Answer text */}
          <p className="chat-ai-text" style={{ whiteSpace: 'pre-wrap' }}>
            {message.answer}
          </p>

          {/* Role disclaimer */}
          {message.disclaimer && (
            <p className="chat-ai-disclaimer">{message.disclaimer}</p>
          )}

          {/* Timestamp */}
          <span className="chat-bubble-time chat-bubble-time-ai">
            {formatTime(message.timestamp)}
          </span>
        </div>

        {/* Sources panel */}
        {(message.show_sources_panel || message.no_results) && (
          <SourcesPanel
            sources={message.sources || []}
            confidence={message.confidence}
            no_results={message.no_results}
            sources_label={message.sources_label}
          />
        )}

        {/* Phase 5: XAI Reasoning Path */}
        <ReasoningPanel message={message} />
      </div>
    </div>
  );
}

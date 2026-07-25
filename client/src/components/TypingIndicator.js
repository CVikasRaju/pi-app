'use client';

/**
 * TypingIndicator — three-dot animated indicator while AI is thinking
 */
export default function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="AI is thinking" role="status">
      <div className="typing-dot" style={{ animationDelay: '0ms' }} />
      <div className="typing-dot" style={{ animationDelay: '160ms' }} />
      <div className="typing-dot" style={{ animationDelay: '320ms' }} />
    </div>
  );
}

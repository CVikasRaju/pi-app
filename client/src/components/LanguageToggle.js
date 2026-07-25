'use client';

/**
 * LanguageToggle — English / ಕನ್ನಡ language switch component
 *
 * Props:
 *   language     - 'en' | 'kn'
 *   onLanguageChange - function(newLang)
 */
export default function LanguageToggle({ language = 'en', onLanguageChange }) {
  return (
    <div className="language-toggle" role="radiogroup" aria-label="Select language">
      <button
        type="button"
        className={`lang-btn ${language === 'en' ? 'lang-btn-active' : ''}`}
        onClick={() => onLanguageChange?.('en')}
        aria-checked={language === 'en'}
        role="radio"
      >
        English
      </button>
      <button
        type="button"
        className={`lang-btn ${language === 'kn' ? 'lang-btn-active' : ''}`}
        onClick={() => onLanguageChange?.('kn')}
        aria-checked={language === 'kn'}
        role="radio"
      >
        ಕನ್ನಡ
      </button>
    </div>
  );
}

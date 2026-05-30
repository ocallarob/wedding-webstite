'use client';

import { useState } from 'react';

type IrishPhraseProps = {
  phrase: string;
  translation: string;
  className?: string;
};

export function IrishPhrase({ phrase, translation, className }: IrishPhraseProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const supportsHover = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  };

  const onToggle = () => {
    if (!supportsHover()) {
      setShowTranslation((value) => !value);
    }
  };

  const onMouseEnter = () => {
    if (supportsHover()) setIsHovered(true);
  };

  const onMouseLeave = () => {
    if (supportsHover()) setIsHovered(false);
  };

  const showEnglish = showTranslation || isHovered;

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="relative inline-grid place-items-center bg-transparent p-0 text-left"
      aria-label={`Toggle translation: ${showTranslation ? 'Show Irish' : 'Show English'}`}
      title={showTranslation ? 'Tap to show Irish' : 'Tap to show English'}
    >
      <span
        className={`font-script leading-none text-blush transition-opacity duration-150 ${showEnglish ? 'opacity-0' : 'opacity-100'} ${className ?? ''}`}
        style={{ fontFamily: 'var(--font-script), cursive', gridArea: '1 / 1' }}
      >
        {phrase}
      </span>
      <span
        className={`pointer-events-none font-script leading-none text-blush transition-opacity duration-150 ${showEnglish ? 'opacity-100' : 'opacity-0'} ${className ?? ''}`}
        style={{ fontFamily: 'var(--font-script), cursive', gridArea: '1 / 1' }}
      >
        {translation}
      </span>
    </button>
  );
}

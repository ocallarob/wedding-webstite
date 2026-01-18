"use client";

import { useState } from 'react';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Copy failed', error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-xl border border-stone bg-white/80 px-3 py-1.5 text-xs font-medium text-charcoal shadow-sm transition hover:bg-ivory/70 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
    >
      {copied ? 'Copied!' : label ?? 'Copy link'}
    </button>
  );
}

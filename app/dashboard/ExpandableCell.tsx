'use client';

import { useState } from 'react';

type Props = {
  text: string;
  collapsedMaxHeightClassName?: string;
};

export function ExpandableCell({ text, collapsedMaxHeightClassName = 'max-h-16' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = text.length > 80;

  return (
    <div className="max-w-[320px]">
      <p
        className={`text-xs leading-5 whitespace-pre-wrap break-words text-muted transition-colors hover:text-charcoal ${
          shouldCollapse && !expanded ? `${collapsedMaxHeightClassName} overflow-hidden` : ''
        }`}
      >
        {text}
      </p>
      {shouldCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-[11px] uppercase tracking-[0.16em] text-mauve underline-offset-4 hover:underline hover:text-charcoal"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

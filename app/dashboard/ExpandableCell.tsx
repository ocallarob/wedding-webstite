'use client';

import { useState } from 'react';

export function ExpandableCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <span
      onClick={() => setExpanded(!expanded)}
      className={`cursor-pointer ${expanded ? '' : 'max-w-[200px] truncate block'} hover:text-charcoal transition-colors`}
      title={expanded ? undefined : text}
    >
      {text}
    </span>
  );
}

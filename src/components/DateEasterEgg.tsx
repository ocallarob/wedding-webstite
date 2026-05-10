'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = {
  defaultText: string;
  targetDate: string;
  className?: string;
};

function parseTargetDate(input: string): Date | null {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    const [day, month, year] = input.split('/').map(Number);
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCountdown(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'Today is the day';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export function DateEasterEgg({ defaultText, targetDate, className }: Props) {
  const parsedDate = useMemo(() => parseTargetDate(targetDate), [targetDate]);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownText, setCountdownText] = useState(defaultText);

  useEffect(() => {
    if (!showCountdown || !parsedDate) return;

    const tick = () => setCountdownText(formatCountdown(parsedDate));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [showCountdown, parsedDate]);

  const display = showCountdown ? countdownText : defaultText;

  return (
    <button
      type="button"
      onClick={() => setShowCountdown((v) => !v)}
      className={className}
      title="Click for countdown"
      aria-live="polite"
    >
      {display}
    </button>
  );
}


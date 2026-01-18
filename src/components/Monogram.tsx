import Image from 'next/image';

const MONOGRAM_WIDTH = 240;
const MONOGRAM_HEIGHT = 160;

export function Monogram({ size = 36, className }: { size?: number; className?: string }) {
  // Scale the PNG to roughly match the previous inline SVG size.
  const scale = size / MONOGRAM_HEIGHT;

  return (
    <Image
      src="/photos/monogram.png"
      alt="A and R monogram"
      width={MONOGRAM_WIDTH}
      height={MONOGRAM_HEIGHT}
      className={className}
      style={{ width: MONOGRAM_WIDTH * scale, height: MONOGRAM_HEIGHT * scale }}
      priority
    />
  );
}

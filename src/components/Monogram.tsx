import Image from 'next/image';

const MONOGRAM_WIDTH = 256;
const MONOGRAM_HEIGHT = 256;

export function Monogram({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/assets/monogram-transparent.png"
      alt="A and R monogram"
      width={MONOGRAM_WIDTH}
      height={MONOGRAM_HEIGHT}
      className={className}
      style={{ width: size, height: size }}
      priority
    />
  );
}

import cirrusLogo from "@/assets/cirrus-logo.png";

interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export function CirrusLogo({ size = 28, withWordmark = true, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={cirrusLogo}
        alt="Cirrus logo"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="object-contain dark:invert"
        loading="lazy"
      />
      {withWordmark && (
        <span className="font-mono text-sm tracking-[0.18em] uppercase text-foreground">
          Cirrus
        </span>
      )}
    </div>
  );
}

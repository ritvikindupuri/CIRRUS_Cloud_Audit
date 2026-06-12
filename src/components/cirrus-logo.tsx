import cirrusLogo from "@/assets/cirrus-logo.png";

interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  isometric?: boolean;
}

export function CirrusLogo({
  size = 28,
  withWordmark = true,
  className = "",
  isometric = false,
}: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={cirrusLogo}
        alt="Cirrus logo"
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          transform: isometric
            ? "perspective(1200px) rotateX(20deg) rotateY(-25deg) rotateZ(0deg)"
            : "none",
          boxShadow: "none",
          transition: "transform 0.3s ease, box-shadow 0.3s ease",
        }}
        className={`object-contain dark:invert`}
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

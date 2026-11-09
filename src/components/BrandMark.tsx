import { cn } from "@/lib/utils";
import logoDark from "@/assets/logo-dark.png";
import logoTile from "@/assets/logo-tile.png";

/**
 * The mark comes in two cuts of the same artwork, both on transparency so they
 * sit on any dark surface: a square tile for tight spots and the full lockup.
 */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logoTile}
      alt="Manga Automobiles"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLockup({ width = 150, className }: { width?: number; className?: string }) {
  return (
    <img
      src={logoDark}
      alt="Manga Automobiles"
      className={cn("shrink-0 object-contain", className)}
      style={{ width, height: "auto" }}
    />
  );
}

export function BrandWordmark({ className, stacked = false }: { className?: string; stacked?: boolean }) {
  return (
    <span className={cn("font-black uppercase leading-tight tracking-tight text-foreground", className)}>
      Manga{stacked ? <br /> : " "}Automobiles
    </span>
  );
}

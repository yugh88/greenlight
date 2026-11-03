import { LogoMark } from "./logo";

/** Hero wordmark: "Greenlight" handwrites itself, then glows with an occasional flicker. */
export function HeroTitle() {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <LogoMark size={64} />
      <svg className="hand-title h-[72px] w-[300px] sm:h-[96px] sm:w-[400px]" viewBox="0 0 400 96" role="img" aria-label="Greenlight">
        <text x="4" y="72" fontSize="78">
          Greenlight
        </text>
      </svg>
    </div>
  );
}

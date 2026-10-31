/**
 * BanglaDataHub logo — a minimalist monochrome "aperture node": a segmented ring
 * around a central point, a data hub drawn as an aperture. Single-colour via
 * currentColor so it inherits ink/paper context; the wordmark carries the seal
 * accent on "PAK". Kept simple and geometric, in the spirit of a developer brand.
 */

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      {/* segmented aperture ring */}
      <circle cx="12" cy="12" r="8" strokeWidth="2" strokeDasharray="5.4 3.3" />
      {/* central node */}
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-[18px] w-[18px] shrink-0 text-seal" />
      <span className="wordmark text-[15px] leading-none">
        <span className="text-seal">BANGLA</span>
        <span>DATAHUB</span>
      </span>
    </span>
  );
}

import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { fmtDate, fmtRelative } from "@/lib/bangladata/format";
import { cn } from "@/lib/utils";

/**
 * The number component. Mono, tabular, large; mono uppercase label above;
 * hairline beneath; relative timestamp and series id below.
 *
 * If `value` is missing the whole cell renders nothing — a missing figure is
 * fine, a wrong one is not.
 */
export function Figure({
  label,
  value,
  prefix,
  suffix,
  sub,
  seriesId,
  updated,
  size = "md",
  stale = false,
  hideId = false,
  className,
}: {
  label: string;
  value: string | null | undefined;
  prefix?: string;
  suffix?: string;
  sub?: string | null;
  seriesId?: string;
  updated?: string | null;
  size?: "sm" | "md" | "lg";
  stale?: boolean;
  hideId?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") return null;

  const sizes = {
    sm: "text-[19px]",
    md: "text-[26px] md:text-[34px]",
    lg: "text-[34px] md:text-[48px]",
  };

  const body = (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Tape labels are kept to a single line (see the tape config) so values
          sit on a shared baseline without reserving extra vertical space. */}
      <span className={cn("eyebrow", size === "sm" && "truncate")}>{label}</span>
      <span className={cn("num whitespace-nowrap font-medium leading-none", sizes[size])}>
        {prefix}
        {value}
        {suffix}
      </span>
      <span className="block h-px w-full bg-rule" />
      <span className="num flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-soft">
        {sub ? <span>{sub}</span> : null}
        {updated ? <RelativeTime iso={updated} stale={stale} /> : null}
      </span>
      {seriesId && !hideId ? (
        <span className="num text-[12px] text-ink-soft">{seriesId}</span>
      ) : null}
    </div>
  );

  if (!seriesId) return body;

  return (
    <Link
      to="/series/$seriesId"
      params={{ seriesId }}
      title={seriesId}
      className="group block transition-colors hover:text-seal"
    >
      {body}
    </Link>
  );
}

export function RelativeTime({ iso, stale = false }: { iso: string; stale?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <time
      dateTime={iso}
      className={cn("num text-[12px]", stale ? "text-ink-soft" : "text-gilt")}
      title={iso}
    >
      {now === null ? fmtDate(iso) : fmtRelative(iso, now)}
    </time>
  );
}

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Panel({
  ground = "paper",
  children,
  className,
  full = true,
  id,
}: {
  ground?: "paper" | "ink";
  children: ReactNode;
  className?: string;
  full?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        ground === "ink" ? "ground-ink" : "ground-paper",
        "relative bg-paper text-ink",
        full && "panel-shell snap-panel",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelInner({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1160px] px-6 md:px-10", className)}>{children}</div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow border-t border-rule pt-3">
      <span>{children}</span>
    </p>
  );
}

export function PanelHeadline({
  children,
  className,
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  /** Heading level. Pages that use this as their primary heading should pass
      `as="h1"` so the document has exactly one <h1> (on-page SEO). */
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag
      className={cn(
        "font-display text-[38px] leading-[1.02] tracking-[-0.025em] md:text-[64px] lg:text-[72px]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

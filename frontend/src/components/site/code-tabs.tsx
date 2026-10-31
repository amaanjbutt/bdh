import { useState } from "react";

import { cn } from "@/lib/utils";

interface Snippet {
  label: string;
  code: string;
}

export function CodeTabs({
  snippets,
  response,
  className,
}: {
  snippets: Snippet[];
  response?: string | undefined;
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = snippets[active] ?? snippets[0]!;

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between border border-rule border-b-0 bg-paper-sunk px-4">
        <div className="num flex">
          {snippets.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={cn(
                "border-b-2 border-transparent px-3 py-2.5 text-[12px] uppercase tracking-[0.08em] text-ink-soft transition-colors hover:text-ink",
                i === active && "border-seal text-ink",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          className="num text-[12px] text-ink-soft transition-colors hover:text-seal"
        >
          {copied ? "Copied" : "Copy request"}
        </button>
      </div>
      <pre className="num overflow-x-auto border border-rule bg-paper-sunk px-4 py-4 text-[13px] leading-relaxed">
        <code>{current.code}</code>
      </pre>
      {response ? (
        <pre className="num overflow-x-auto border border-rule border-t-0 bg-paper px-4 py-4 text-[13px] leading-relaxed text-ink-soft">
          <code>{response}</code>
        </pre>
      ) : null}
    </div>
  );
}

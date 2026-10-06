import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Contenu aligné à droite du titre (badge, compteur…) */
  aside?: ReactNode;
}

// Carte de base du dashboard : bordure néon discrète, titre en capitales.
export function Panel({ title, children, className = "", aside }: PanelProps) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col rounded-xl border border-line bg-panel/80 p-4 shadow-[0_0_24px_-12px_var(--color-info)] backdrop-blur ${className}`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs font-semibold tracking-[0.2em] text-accent-soft uppercase">{title}</h2>
        {aside}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

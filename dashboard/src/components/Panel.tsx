import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Contenu aligné à droite du titre (badge, compteur…) */
  aside?: ReactNode;
}

// Carte de base du dashboard : bordure néon en dégradé, titre lumineux.
export function Panel({ title, children, className = "", aside }: PanelProps) {
  return (
    <section aria-label={title} className={`neon-panel flex flex-col rounded-xl p-4 ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="neon-glow font-mono text-xs font-semibold tracking-[0.25em] text-accent-soft uppercase">
          <span aria-hidden="true" className="text-info">▸ </span>
          {title}
        </h2>
        {aside}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

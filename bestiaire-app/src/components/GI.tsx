import { GI_PATHS, GIName } from '../game/icons';

/** Icône game-icons.net (CC BY 3.0) en SVG, couleur = currentColor */
export function GI({ n, className, title }: { n: GIName; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={`gi ${className || ''}`} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path fill="currentColor" d={GI_PATHS[n]} />
    </svg>
  );
}

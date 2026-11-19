import { useId } from 'react';
import type { ReactNode } from 'react';

type Side = 'bottom' | 'top' | 'right' | 'left';
type Align = 'start' | 'center' | 'end';

const SIDE: Record<Side, string> = {
  bottom: 'top-full mt-1',
  top: 'bottom-full mb-1',
  right: 'left-full ml-1 top-1/2 -translate-y-1/2',
  left: 'right-full mr-1 top-1/2 -translate-y-1/2',
};

const ALIGN: Record<Align, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

/**
 * Info popup that shows on hover and on keyboard focus (CSS only). The child
 * gets the tooltip id, to set as `aria-describedby` on the focusable element.
 * The tooltip stays in the DOM, so screen readers read it as the description.
 * Inside a tile (a CSS container), the width is at most 80% of the tile, so
 * a side tooltip does not go past the edge of the viewport.
 */
export function Tip({ text, children, side = 'bottom', align = 'center', className = '' }: {
  text: ReactNode;
  children: (describedBy: string) => ReactNode;
  side?: Side;
  align?: Align;
  className?: string;
}) {
  const id = useId();
  // A caller can place the anchor itself (for example `absolute ...`); else it is `relative`.
  const anchor = /\b(absolute|fixed|sticky)\b/.test(className) ? '' : 'relative';
  const position = side === 'bottom' || side === 'top' ? `${SIDE[side]} ${ALIGN[align]}` : SIDE[side];
  // The open tooltip must cover the other controls of the tile, so its anchor
  // goes above their z-index (the variants override a z-index in `className`).
  return (
    <span className={`group/tip ${anchor} ${className} hover:z-50 focus-within:z-50`}>
      {children(id)}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none invisible absolute z-40 w-max max-w-[min(220px,80cqw)] rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-left text-[11px] font-normal leading-snug whitespace-normal normal-case tracking-normal text-neutral-200 opacity-0 shadow-xl transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100 group-hover/tip:delay-300 ${position}`}
      >
        {text}
      </span>
    </span>
  );
}

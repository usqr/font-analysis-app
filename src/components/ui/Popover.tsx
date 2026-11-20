import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

function place(pop: HTMLElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8));
  let top = r.bottom + 6;
  if (top + pop.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - 6 - pop.offsetHeight);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

/** Arrow keys move the focus between the items of a menu. */
function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.menu-item'));
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next]?.focus();
}

/**
 * A native popover next to `anchor`. Mount it to open it. A click outside or
 * Escape closes it (light dismiss) and calls `onClose`. The focus goes back
 * to the anchor when the popover had it.
 */
export function Popover({ anchor, onClose, role, label, className = '', children }: {
  anchor: HTMLElement;
  onClose: () => void;
  role: 'dialog' | 'menu';
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const pop = ref.current;
    if (!pop) return;
    const restoreFocus = () => {
      const a = document.activeElement;
      if (anchor.isConnected && (a === document.body || pop.contains(a))) anchor.focus({ preventScroll: true });
    };
    const onToggle = (e: Event) => {
      if ((e as Event & { newState?: string }).newState !== 'closed') return;
      restoreFocus();
      onCloseRef.current();
    };
    pop.showPopover();
    place(pop, anchor);
    pop.querySelector<HTMLElement>('[aria-checked="true"], input, button')?.focus({ preventScroll: true });
    pop.addEventListener('toggle', onToggle);
    return () => {
      pop.removeEventListener('toggle', onToggle);
      restoreFocus();
      if (pop.matches(':popover-open')) pop.hidePopover();
    };
  }, [anchor]);

  return (
    <div
      ref={ref}
      popover="auto"
      className={`pop ${className}`}
      role={role}
      aria-label={label}
      onKeyDown={role === 'menu' ? onMenuKey : undefined}
    >
      {children}
    </div>
  );
}

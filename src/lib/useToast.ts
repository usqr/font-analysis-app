import { useCallback, useEffect, useRef, useState } from 'react';

/** A short status message that hides after `ms`. */
export function useToast(ms = 2200): { message: string; visible: boolean; show: (msg: string) => void } {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, visible, show };
}

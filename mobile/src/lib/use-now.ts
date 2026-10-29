import { useEffect, useState } from 'react';

/** Hora atual (ms) que se atualiza sozinha a cada `intervalMs` — mantém o render puro. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

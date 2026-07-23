import { useEffect, useState } from "react";

const KEY = "viaair:unlinked-hotels:ignored";
const EVENT = "viaair:unlinked-hotels:changed";

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function write(next: Set<string>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Array.from(next)));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

export function useIgnoredHotels() {
  const [ids, setIds] = useState<Set<string>>(() => read());

  useEffect(() => {
    const sync = () => setIds(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const ignore = (id: string) => {
    const next = new Set(read());
    next.add(id);
    write(next);
    setIds(next);
  };
  const restore = (id: string) => {
    const next = new Set(read());
    next.delete(id);
    write(next);
    setIds(next);
  };
  const restoreAll = () => {
    write(new Set());
    setIds(new Set());
  };

  return { ids, ignore, restore, restoreAll };
}

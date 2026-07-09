export type CofreEntry = {
  id: string;
  createdAt: number;
  customer?: string;
  customerPhone?: string;
  description: string;
  total: number;
  installments: number;
  firstAmount?: number;
  orderRef?: string;
  orderNumber?: string;
  imageUrl?: string;
  supplier?: string;
  locator?: string;
  route?: string;
  travelDate?: string;
  url: string;
};


const KEY = "viaair.cofre.entries.v1";

export function listCofreEntries(): CofreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CofreEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCofreEntry(entry: Omit<CofreEntry, "id" | "createdAt">): CofreEntry {
  const all = listCofreEntries();
  // dedupe by url — update timestamp if it already exists
  const existing = all.find((e) => e.url === entry.url);
  if (existing) {
    existing.createdAt = Date.now();
    Object.assign(existing, entry);
    localStorage.setItem(KEY, JSON.stringify(all));
    return existing;
  }
  const created: CofreEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  all.unshift(created);
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200)));
  return created;
}

export function deleteCofreEntry(id: string) {
  const all = listCofreEntries().filter((e) => e.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearCofre() {
  localStorage.removeItem(KEY);
}

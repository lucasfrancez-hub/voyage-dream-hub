import { resolveRef, trpc } from "../src/lib/quotes/infotravel-api.server";
const ref: any = resolveRef(process.argv[2]!);
const b: any = await trpc<any>(ref, "main.getBooking", { companyCode: ref.companyCode, bookingId: ref.bookingId, ...(ref.bookingIndex != null ? { bookingIndex: ref.bookingIndex } : {}), clientUrl: ref.clientUrl });
const pkgs = b.bookingPackages ?? [];
const p = pkgs[0];
console.log("pkg keys", Object.keys(p));
const dump = (n: any, path: string, d = 0) => {
  if (!n || typeof n !== "object" || d > 6) return;
  if (Array.isArray(n)) return n.forEach((x, i) => dump(x, `${path}[${i}]`, d + 1));
  if (Array.isArray(n.fares)) console.log(path, JSON.stringify(n.fares).slice(0, 900));
  for (const [k, v] of Object.entries(n)) if (v && typeof v === "object" && k !== "fares") dump(v, `${path}.${k}`, d + 1);
};
dump(p, "pkg");

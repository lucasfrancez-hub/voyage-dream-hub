import { resolveRef } from "../src/lib/quotes/infotravel-api.server";
const mod: any = await import("../src/lib/quotes/infotravel-api.server");
const url = process.argv[2]!;
const ref = resolveRef(url);
// replicate trpc call via internal fetch: use exported? fallback
const trpc = (mod as any).trpc;
console.log("trpc exported?", typeof trpc);

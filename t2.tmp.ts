import { splitTourHtmlBlocks } from "./src/lib/packages/tour-html";
const html = await Bun.file("/mnt/user-uploads/pasted-2026-07-29T01-14-23-134Z.txt").text();
const { parseHTML } = await import("linkedom");
(globalThis as any).DOMParser = class { parseFromString(s: string){ return parseHTML(s).document; } };
const b = splitTourHtmlBlocks(html);
console.log(b.length, b[0].length);
const i = b[0].indexOf("taxas inclusas");
console.log("idx", i, JSON.stringify(b[0].slice(i-200, i+200)));

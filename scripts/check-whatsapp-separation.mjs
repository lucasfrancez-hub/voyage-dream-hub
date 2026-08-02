#!/usr/bin/env node
/**
 * Guarda de arquitetura WhatsApp (VIA AIR).
 *
 * Regra: a UazAPI é EXCLUSIVA do broadcast. Todo o fluxo do chatbot
 * (webhook, respostas, mídias, cards, transferências, status) usa
 * exclusivamente a Meta WhatsApp Cloud API.
 *
 * Falha o processo se:
 *  - algum arquivo fora da allowlist de broadcast referenciar UazAPI/UAZAPI_*;
 *  - algum arquivo do chatbot importar o serviço de broadcast;
 *  - algum arquivo de broadcast chamar o serviço de envio do chatbot.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// Únicos lugares autorizados a falar com a UazAPI (broadcast / disparo em massa).
const UAZ_ALLOWLIST = [
  "src/lib/broadcast/sync.server.ts",
  "scripts/check-whatsapp-separation.mjs",
];

// Módulos que pertencem ao fluxo do chatbot / atendimento individual.
const CHATBOT_PREFIXES = [
  "src/lib/whatsapp/",
  "src/lib/chat/",
  "src/routes/api/public/whatsapp-webhook.ts",
  "src/routes/api/public/hooks/dispatch-ai-debounced.ts",
  "src/routes/api/public/hooks/close-inactive-protocols.ts",
  "src/routes/api/public/hooks/flight-quote-watchdog.ts",
  "src/routes/api/public/hooks/check-flight-changes.ts",
];

const UAZ_RE = /uazapi|UAZAPI_[A-Z_]+/i;
const BROADCAST_IMPORT_RE = /["'`]@\/lib\/broadcast\/sync\.server["'`]/;
const CHATBOT_SEND_IMPORT_RE = /["'`]@\/lib\/whatsapp\/send\.server["'`]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "_snapshots") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith(".bak")) {
      out.push(full);
    }
  }
  return out;
}

const errors = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const raw = readFileSync(file, "utf8");
  // Remove comentários: menções em documentação não contam como uso.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const isBroadcast = rel.startsWith("src/lib/broadcast/") || rel.endsWith("hooks/broadcast-dispatch.ts");
  const isChatbot = CHATBOT_PREFIXES.some((p) => rel === p || rel.startsWith(p));

  if (UAZ_RE.test(code) && !UAZ_ALLOWLIST.includes(rel)) {
    // Comentários explicativos são permitidos; chamadas não.
    const offending = code
      .split("\n")
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => UAZ_RE.test(l));
    if (offending.length) {
      errors.push(
        `${rel}: uso da UazAPI fora do módulo de broadcast (linhas ${offending
          .map(([n]) => n)
          .join(", ")}). O chatbot deve usar a Meta WhatsApp Cloud API.`,
      );
    }
  }

  if (isChatbot && BROADCAST_IMPORT_RE.test(code)) {
    errors.push(`${rel}: módulo do chatbot importando o serviço de broadcast (UazAPI). Proibido.`);
  }

  if (isBroadcast && CHATBOT_SEND_IMPORT_RE.test(code)) {
    errors.push(`${rel}: módulo de broadcast importando o serviço de envio do chatbot (Meta). Proibido.`);
  }
}

if (errors.length) {
  console.error("\n❌ Separação WhatsApp violada:\n");
  for (const e of errors) console.error(" - " + e);
  console.error("\nUazAPI = somente broadcast. Chatbot = somente Meta Cloud API.\n");
  process.exit(1);
}

console.log("✅ Separação WhatsApp ok: UazAPI só no broadcast, chatbot 100% Meta Cloud API.");

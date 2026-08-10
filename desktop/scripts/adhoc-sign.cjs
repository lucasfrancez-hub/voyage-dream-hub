/**
 * Assinatura ad-hoc + validação do bundle (builds de desenvolvimento).
 *
 * No Apple Silicon TODO executável precisa de assinatura válida (nem que seja
 * ad-hoc). O electron-builder, quando roda sem certificado, entrega o .app com
 * a assinatura original do Electron quebrada pelos nossos arquivos — o macOS
 * então acusa "está danificado e não pode ser aberto".
 *
 * Este hook roda depois do empacotamento e antes do DMG:
 *  1. garante chmod +x nos binários (ffmpeg/ffprobe/helpers);
 *  2. remove xattrs herdados do checkout;
 *  3. assina ad-hoc (`codesign --sign -`) de dentro pra fora;
 *  4. valida com `codesign --verify --deep --strict`.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const sh = (cmd, args) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Binários Mach-O soltos (ffmpeg, ffprobe, .node, .dylib) dentro do app. */
function machoFiles(appPath) {
  const alvos = [];
  for (const f of walk(appPath)) {
    const base = path.basename(f);
    const ext = path.extname(f);
    const dentroBin = f.includes(`${path.sep}Contents${path.sep}Resources${path.sep}bin${path.sep}`);
    if (
      ext === ".dylib" ||
      ext === ".node" ||
      (dentroBin && (base === "ffmpeg" || base === "ffprobe" || ext === ""))
    ) {
      try {
        if (sh("file", ["-b", f]).includes("Mach-O")) alvos.push(f);
      } catch {
        /* ignora */
      }
    }
  }
  return alvos;
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  const recursosBin = path.join(appPath, "Contents", "Resources", "bin");
  for (const nome of ["ffmpeg", "ffprobe"]) {
    const alvo = path.join(recursosBin, nome);
    if (!fs.existsSync(alvo)) throw new Error(`[sidecar] ausente no bundle: ${alvo}`);
    fs.chmodSync(alvo, 0o755);
  }

  if (process.env.EDITAIR_ADHOC !== "1") return;
  console.log(`[adhoc] assinando ${appPath}`);

  // 1) permissões dos binários empacotados
  const binarios = machoFiles(appPath);
  for (const b of binarios) fs.chmodSync(b, 0o755);
  console.log(`[adhoc] ${binarios.length} binários Mach-O ajustados (chmod 755)`);

  // 2) limpa atributos estendidos que invalidam a assinatura
  try {
    sh("xattr", ["-cr", appPath]);
  } catch {
    /* nada a limpar */
  }

  // 3) assina de dentro pra fora (frameworks/helpers antes do bundle raiz)
  const entitlements = path.join(__dirname, "..", "assets", "entitlements.mac.plist");
  const signOne = (target, extra = []) =>
    sh("codesign", [
      "--force",
      "--timestamp=none",
      "--sign",
      "-",
      ...extra,
      target,
    ]);

  for (const b of binarios) signOne(b);

  const frameworks = path.join(appPath, "Contents", "Frameworks");
  if (fs.existsSync(frameworks)) {
    for (const e of fs.readdirSync(frameworks)) {
      const p = path.join(frameworks, e);
      if (e.endsWith(".app") || e.endsWith(".framework") || e.endsWith(".dylib")) {
        signOne(p, e.endsWith(".app") ? ["--entitlements", entitlements] : []);
      }
    }
  }
  signOne(appPath, ["--entitlements", entitlements]);

  // 4) validação — falha o build se o bundle não estiver íntegro
  sh("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  console.log("[adhoc] codesign --verify --deep --strict OK");
};

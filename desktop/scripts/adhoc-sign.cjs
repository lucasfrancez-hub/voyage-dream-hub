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
    const dentroUnpacked = f.includes("app.asar.unpacked");
    if (
      ext === ".dylib" ||
      ext === ".node" ||
      (dentroUnpacked && (base === "ffmpeg" || base === "ffprobe" || ext === ""))
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

/**
 * O pacote `ffprobe-static` traz os binários de TODAS as plataformas
 * (darwin/linux/win32). Sem poda, o bundle leva `bin/linux/x64/ffprobe` junto —
 * o que engorda o app e faz validação/uso pegarem o binário errado.
 * Aqui mantemos SOMENTE `bin/<platform>/<arch>` do build atual.
 */
function podarFfprobe(appPath, platform, arch) {
  const raiz = path.join(
    appPath,
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "node_modules",
    "ffprobe-static",
    "bin",
  );
  if (!fs.existsSync(raiz)) return null;

  const alvoDir = path.join(raiz, platform, arch);
  const alvo = path.join(alvoDir, platform === "win32" ? "ffprobe.exe" : "ffprobe");
  if (!fs.existsSync(alvo)) {
    throw new Error(
      `[ffprobe] binário ${platform}/${arch} não encontrado em ${raiz}. ` +
        `Conteúdo: ${fs.readdirSync(raiz).join(", ")}`,
    );
  }

  for (const so of fs.readdirSync(raiz)) {
    const dirSo = path.join(raiz, so);
    if (!fs.statSync(dirSo).isDirectory()) continue;
    if (so !== platform) {
      fs.rmSync(dirSo, { recursive: true, force: true });
      continue;
    }
    for (const a of fs.readdirSync(dirSo)) {
      if (a !== arch) fs.rmSync(path.join(dirSo, a), { recursive: true, force: true });
    }
  }
  fs.chmodSync(alvo, 0o755);
  console.log(`[ffprobe] mantido apenas ${platform}/${arch}: ${alvo}`);
  return alvo;
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // Poda sempre (dev e release): o app só pode conter o ffprobe da plataforma alvo.
  podarFfprobe(appPath, "darwin", context.arch === 1 ? "x64" : context.arch === 3 ? "arm64" : process.arch);

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

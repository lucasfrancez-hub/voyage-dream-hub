/** Assinatura XMLDSig enveloped para o XML nativo IPM/AtendeNet. */
import forge from "node-forge";
import { SignedXml } from "xml-crypto";

type LoadedCert = { privateKeyPem: string; certBase64: string };
const cache = new Map<string, LoadedCert>();

/** Resolve variáveis de ambiente do certificado por CNPJ do prestador. */
function certEnvFor(cnpj?: string | null): { b64Var: string; pwdVar: string; rawB64?: string; pwd?: string } {
  const digits = (cnpj ?? "").replace(/\D/g, "");
  // LFR TRAVEL SERVICES LTDA
  if (digits === "47430791000153") {
    return {
      b64Var: "NFSE_LFR_CERT_PFX_BASE64",
      pwdVar: "NFSE_LFR_CERT_PASSWORD",
      rawB64: process.env.NFSE_LFR_CERT_PFX_BASE64,
      pwd: process.env.NFSE_LFR_CERT_PASSWORD,
    };
  }
  return {
    b64Var: "NFSE_CERT_PFX_BASE64",
    pwdVar: "NFSE_CERT_PASSWORD",
    rawB64: process.env.NFSE_CERT_PFX_BASE64,
    pwd: process.env.NFSE_CERT_PASSWORD,
  };
}

function parsePkcs12(buf: Buffer, password: string): forge.pkcs12.Pkcs12Pfx {
  const binary = buf.toString("binary");
  const asn1 = (forge.asn1.fromDer as unknown as (
    bytes: string,
    options: { strict: boolean; parseAllBytes: boolean; decodeBitStrings: boolean },
  ) => forge.asn1.Asn1)(binary, {
    strict: false,
    parseAllBytes: true,
    decodeBitStrings: true,
  });

  // O certificado da VIA AIR usa BER com comprimentos indefinidos (30 80).
  // O segundo argumento precisa ser false; passar a senha nessa posição ativa
  // implicitamente o modo DER estrito do node-forge.
  return forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
}

function normalizeBase64(raw: string): string {
  let s = raw.trim();
  // remove eventual prefixo data URI
  s = s.replace(/^data:[^;]+;base64,/i, "");
  // remove aspas e espaços/quebras de linha
  s = s.replace(/^["']|["']$/g, "").replace(/\s+/g, "");
  // url-safe -> padrão
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  // padding
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return s;
}

function loadCertFromEnv(): LoadedCert {
  if (cached) return cached;
  const rawB64 = process.env.NFSE_CERT_PFX_BASE64;
  const pwd = process.env.NFSE_CERT_PASSWORD;
  if (!rawB64 || !pwd) throw new Error("Certificado NFS-e não configurado");

  const b64 = normalizeBase64(rawB64);
  const buf = Buffer.from(b64, "base64");
  const header = buf.subarray(0, 4).toString("hex");
  // .p12 (PKCS#12) começa com SEQUENCE: 0x3082 (DER long-form) OU 0x3080 (BER indefinite)
  if (buf.length < 500 || !header.startsWith("30")) {
    throw new Error(
      `Certificado NFSE_CERT_PFX_BASE64 inválido ou truncado: ` +
      `base64 length=${rawB64.length}, decoded bytes=${buf.length}, header=0x${header}. ` +
      `Esperado .p12 iniciando com 0x30 e com vários KB.`
    );
  }
  let p12;
  try {
    p12 = parsePkcs12(buf, pwd);
  } catch (e: any) {
    throw new Error(
      `Falha ao decodificar .p12 (bytes=${buf.length}, header=0x${header}): ${e?.message || e}. ` +
      `O arquivo configurado precisa ser a cópia Base64 integral do certificado A1 original.`
    );
  }
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag) keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no certificado A1");

  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado público não encontrado no certificado A1");

  cached = {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey),
    certBase64: forge.pki.certificateToPem(certBag.cert)
      .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, ""),
  };
  return cached;
}

/** Assina a raiz <nfse id="nota"> e insere Signature antes de </nfse>. */
export async function signNfseXml(xml: string): Promise<string> {
  if (!/<nfse\s[^>]*id="nota"[^>]*>/i.test(xml)) {
    throw new Error('Elemento <nfse id="nota"> não encontrado para assinatura');
  }

  const { privateKeyPem, certBase64 } = loadCertFromEnv();
  const certPem = `-----BEGIN CERTIFICATE-----\n${certBase64.match(/.{1,64}/g)?.join("\n") ?? certBase64}\n-----END CERTIFICATE-----`;
  const signer = new SignedXml({ privateKey: privateKeyPem, publicCert: certPem });
  signer.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  signer.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
  signer.addReference({
    xpath: "//*[@id='nota']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    uri: "#nota",
  });
  signer.computeSignature(xml, {
    location: { reference: "//*[@id='nota']", action: "append" },
  });
  return signer.getSignedXml();
}

export function getCertInfo(): { subject: string; issuer: string; notAfter: string } {
  const rawB64 = process.env.NFSE_CERT_PFX_BASE64;
  const pwd = process.env.NFSE_CERT_PASSWORD;
  if (!rawB64 || !pwd) throw new Error("Certificado não configurado");
  const p12 = parsePkcs12(Buffer.from(normalizeBase64(rawB64), "base64"), pwd);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado ausente no .p12");
  return {
    subject: certBag.cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    issuer: certBag.cert.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    notAfter: certBag.cert.validity.notAfter.toISOString(),
  };
}

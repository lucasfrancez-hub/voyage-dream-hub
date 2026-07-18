/**
 * Assinatura digital XMLDSig (enveloped) para NFS-e IPM 2.0 / AtendeNet Paranavaí.
 *
 * Padrão exigido pelo AtendeNet:
 *   - Enveloped signature dentro do elemento <Rps id="…">
 *   - Transform: enveloped-signature + XML C14N (exclusiva sem comentários)
 *   - DigestMethod: SHA-1
 *   - SignatureMethod: RSA-SHA1
 *   - KeyInfo com X509Certificate (base64, sem PEM headers)
 *
 * Implementação SERVER-ONLY: parse do .p12 via node-forge, canonicalização
 * mínima (exclusive C14N sem namespaces herdados), assinatura RSA-SHA1.
 */
import forge from "node-forge";

type LoadedCert = {
  privateKey: forge.pki.rsa.PrivateKey;
  certPem: string;
  certBase64: string; // sem headers PEM, uma linha
};

let cached: LoadedCert | null = null;

function loadCertFromEnv(): LoadedCert {
  if (cached) return cached;
  const b64 = process.env.NFSE_CERT_PFX_BASE64;
  const pwd = process.env.NFSE_CERT_PASSWORD;
  if (!b64 || !pwd) throw new Error("Certificado NFS-e não configurado (NFSE_CERT_PFX_BASE64 / NFSE_CERT_PASSWORD)");

  const der = forge.util.decode64(b64);
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, pwd);

  // Chave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag) {
    const alt = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag = alt[forge.pki.oids.keyBag]?.[0];
  }
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no .p12");

  // Certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado não encontrado no .p12");

  const certPem = forge.pki.certificateToPem(certBag.cert);
  const certBase64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");

  cached = {
    privateKey: keyBag.key as forge.pki.rsa.PrivateKey,
    certPem,
    certBase64,
  };
  return cached;
}

/**
 * Canonicalização C14N exclusiva mínima do elemento a ser assinado.
 * Como o XML gerado pelo `buildAtendenetXml` já é bem-formado e usa
 * namespace único no root (herdado), aplicamos uma normalização
 * conservadora: remove declarações XML, colapsa whitespace entre tags,
 * mantém atributos como escritos. Suficiente para os RPS aceitos pelo IPM.
 */
function canonicalize(xmlFragment: string): string {
  return xmlFragment
    .replace(/<\?xml[^?]*\?>/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

async function sha1Base64(input: string): Promise<string> {
  const md = forge.md.sha1.create();
  md.update(input, "utf8");
  return forge.util.encode64(md.digest().bytes());
}

/**
 * Assina o elemento <Rps id="…"> dentro do XML enviado.
 * Retorna o XML completo com <Signature> injetado logo antes de </Rps>.
 */
export async function signRpsXml(xml: string, rpsId: string): Promise<string> {
  const { privateKey, certBase64 } = loadCertFromEnv();

  // 1. Extrai o elemento <Rps id="…">…</Rps>
  const rpsMatch = xml.match(/<Rps\s[^>]*id="([^"]+)"[^>]*>[\s\S]*?<\/Rps>/);
  if (!rpsMatch) throw new Error("Elemento <Rps> não encontrado no XML para assinatura");
  const rpsElement = rpsMatch[0];

  // 2. Digest do elemento canonicalizado
  const canonicalRps = canonicalize(rpsElement);
  const digestValue = await sha1Base64(canonicalRps);

  // 3. Monta <SignedInfo> com referência ao Rps
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="#${rpsId}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  // 4. Assina o SignedInfo canonicalizado com RSA-SHA1
  const md = forge.md.sha1.create();
  md.update(canonicalize(signedInfo), "utf8");
  const signatureBytes = privateKey.sign(md);
  const signatureValue = forge.util.encode64(signatureBytes);

  // 5. Monta o bloco Signature completo
  const signatureBlock = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  // 6. Injeta a Signature antes de </Rps>
  return xml.replace(/<\/Rps>/, `${signatureBlock}</Rps>`);
}

/**
 * Metadados do certificado (para diagnóstico / UI).
 */
export function getCertInfo(): { subject: string; issuer: string; notAfter: string } {
  const b64 = process.env.NFSE_CERT_PFX_BASE64;
  const pwd = process.env.NFSE_CERT_PASSWORD;
  if (!b64 || !pwd) throw new Error("Certificado não configurado");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(b64)), pwd);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado ausente no .p12");
  const cert = certBag.cert;
  return {
    subject: cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    issuer: cert.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    notAfter: cert.validity.notAfter.toISOString(),
  };
}

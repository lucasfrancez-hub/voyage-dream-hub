/**
 * Números que NÃO podem receber dados cadastrais/corporativos da VIA AIR
 * (CNPJ, razão social, inscrição municipal, endereço da agência, dados
 * bancários, etc.) pela IA no WhatsApp.
 *
 * Para todos os outros clientes esses dados podem ser informados normalmente.
 * Basta acrescentar o número (só dígitos, com DDI) na lista abaixo.
 */
const BLOCKED_PHONES = [
  "556992133402", // Eudes Etur Viagens e Turismo
];

function digits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Compara ignorando o 9º dígito do celular BR e o DDI. */
function variants(d: string): string[] {
  const out = new Set<string>([d]);
  if (d.length >= 8) out.add(d.slice(-8));
  if (d.length >= 10) out.add(d.slice(-10));
  if (d.length >= 11) out.add(d.slice(-11));
  return Array.from(out);
}

/** true quando o número está bloqueado para dados cadastrais da empresa. */
export function isCompanyDataBlocked(waPhone: string): boolean {
  const target = variants(digits(waPhone));
  return BLOCKED_PHONES.some((b) => {
    const bv = variants(digits(b));
    return bv.some((x) => target.includes(x));
  });
}

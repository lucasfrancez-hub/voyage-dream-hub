import fs from "node:fs";
import { renderBoletoHtml } from "../src/lib/boleto-html";
const qr = "data:image/png;base64," + fs.readFileSync("/tmp/bol/qr.png").toString("base64");
const html = renderBoletoHtml({
  documentoRef: "pay_a9zu390cj97qi065",
  vencimento: "2026-08-15",
  valor: 4980.00,
  pagador: { nome: "CLIENTE EXEMPLO", cpfCnpj: "000.000.000-00", telefone: "(44) 99999-0000", email: "cliente@exemplo.com", endereco: "Rua Exemplo, 123 - Bairro Exemplo - Paranavaí/PR - CEP 87700-000" },
  composicao: { servico: "Pacote de Viagem - Aéreo + Hotel", destino: "São Paulo/SP", periodo: "Ida: 11/08/2026 • Volta: 13/08/2026", passageiro: "Fernando Elias de Carvalho" },
  pix: { qrImage: qr, payload: "00020101021226870014br.gov.bcb.pix2558pix.asaas.com/qr/cobv7024089a3772-4e01-a6a2-b6ab1d3eef3652040005303986586028R55923VIA AIR AGENCIA E REPRESE6009Paranava810887707126207050 3***630400F51" },
  banco: { nome: "ASAAS IP S.A.", codigo: "461-0", linhaDigitavel: "10491234567890123456789012345678198040000498000", nossoNumero: "8783 2499 1", dataDocumento: "2026-08-08", dataProcessamento: "2026-08-08", carteira: "25", agenciaCodigo: "0001 / 8783249" },
  multaPercent: 2, jurosPercentMes: 1,
});
fs.writeFileSync("/tmp/bol/out.html", html);

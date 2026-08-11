import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  executarJob,
  abrirJob,
  lerJobs,
  jobsAtivos,
  jobEmAndamento,
  cancelarJob,
  rotuloCompacto,
  _resetarJobs,
} from "@/lib/editair/jobs";

describe("Central de Processamento", () => {
  beforeEach(() => _resetarJobs());

  it("mantém a tarefa viva independente de componente e reporta etapa real", async () => {
    let liberar!: () => void;
    const espera = new Promise<void>((r) => (liberar = r));
    const { promessa } = executarJob(
      { projectId: "p1", type: "transcricao", title: "Transcrição", targetId: "c1" },
      async (ctl) => {
        ctl.etapa("Transcrevendo fala…", 42);
        await espera;
        return 37;
      },
    );
    expect(jobsAtivos("p1")).toHaveLength(1);
    expect(lerJobs()[0]!.stage).toBe("Transcrevendo fala…");
    expect(lerJobs()[0]!.progress).toBe(42);
    liberar();
    const r = await promessa;
    expect(r).toEqual({ ok: true, valor: 37 });
    expect(lerJobs()[0]!.status).toBe("completed");
  });

  it("não inventa porcentagem quando não há progresso mensurável", () => {
    executarJob({ projectId: "p1", type: "gerar-midia", title: "Gerando cena com IA" }, () => new Promise(() => {}));
    expect(lerJobs()[0]!.progress).toBeNull();
    expect(rotuloCompacto(jobsAtivos("p1"))).toBe("Gerando cena com IA");
  });

  it("cancela sem quebrar o projeto", async () => {
    const { id, promessa } = executarJob(
      { projectId: "p1", type: "proxy", title: "Gerando proxy" },
      (ctl) =>
        new Promise<void>((_res, rej) => {
          ctl.signal.addEventListener("abort", () => rej(new Error("abortado")));
        }),
    );
    cancelarJob(id);
    const r = await promessa;
    expect(r).toEqual({ ok: false, cancelado: true });
    expect(jobsAtivos("p1")).toHaveLength(0);
  });

  it("registra falha sem bloquear os outros processos", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    const { promessa } = executarJob({ projectId: "p1", type: "legendas", title: "Legendas" }, async () => {
      throw new Error("áudio ilegível");
    });
    const r = await promessa;
    expect(r).toEqual({ ok: false, cancelado: false, erro: "áudio ilegível" });
    expect(lerJobs()[0]!.status).toBe("failed");
    espiao.mockRestore();
  });

  it("evita duplicar a mesma tarefa para o mesmo clipe", () => {
    executarJob({ projectId: "p1", type: "remover-fundo", title: "Recorte", targetId: "c9" }, () => new Promise(() => {}));
    expect(jobEmAndamento("remover-fundo", "c9")).toBeTruthy();
    expect(jobEmAndamento("remover-fundo", "c8")).toBeUndefined();
  });

  it("resume vários processos no indicador compacto", () => {
    executarJob({ projectId: "p1", type: "legendas", title: "Legendas" }, () => new Promise(() => {}));
    executarJob({ projectId: "p1", type: "proxy", title: "Proxy" }, () => new Promise(() => {}));
    executarJob({ projectId: "p1", type: "waveform", title: "Waveform" }, () => new Promise(() => {}));
    expect(rotuloCompacto(jobsAtivos("p1"))).toBe("3 processos");
  });

  it("abrirJob acompanha fluxos imperativos com try/finally", async () => {
    const job = abrirJob({ projectId: "p1", type: "importar-midia", title: "Importando mídia" });
    job.etapa("Convertendo vídeo…", 80);
    expect(lerJobs()[0]!.progress).toBe(80);
    job.concluir("Mídia pronta");
    job.fechar();
    await Promise.resolve();
    await Promise.resolve();
    expect(lerJobs()[0]!.status).toBe("completed");
    expect(lerJobs()[0]!.resultado).toBe("Mídia pronta");
  });
});

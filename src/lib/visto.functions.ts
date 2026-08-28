import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VisaAdminRow = {
  id: string;
  protocolo: string;
  token: string;
  status: string;
  applicantName: string | null;
  applicantPhone: string | null;
  applicantEmail: string | null;
  applicantCpf: string | null;
  formData: Record<string, any>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

const SELECT = "*";

const map = (row: Record<string, any>): VisaAdminRow => ({
  id: row.id,
  protocolo: row.protocolo,
  token: row.token,
  status: row.status,
  applicantName: row.applicant_name ?? null,
  applicantPhone: row.applicant_phone ?? null,
  applicantEmail: row.applicant_email ?? null,
  applicantCpf: row.applicant_cpf ?? null,
  formData: (row.form_data ?? {}) as Record<string, any>,
  notes: row.notes ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at ?? null,
});

export const listVisaRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VisaAdminRow[]> => {
    const { data, error } = await context.supabase
      .from("visa_requests")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => map(r as Record<string, any>));
  });

export const createVisaRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nome: z.string().max(120).optional().nullable(),
        telefone: z.string().max(20).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<VisaAdminRow> => {
    const { data: row, error } = await context.supabase
      .from("visa_requests")
      .insert({
        applicant_name: data.nome?.trim() || null,
        applicant_phone: data.telefone?.trim() || null,
        created_by: context.userId,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return map(row as Record<string, any>);
  });

export const updateVisaRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.string().max(40).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VisaAdminRow> => {
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
    const { data: row, error } = await context.supabase
      .from("visa_requests")
      .update(patch as never)
      .eq("id", data.id)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return map(row as Record<string, any>);
  });

import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
          <Construction className="h-8 w-8 text-[#F26B1F]" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">
          {description ?? "Este módulo está em construção. A estrutura já foi preparada e será entregue na próxima fase."}
        </p>
      </div>
    </div>
  );
}

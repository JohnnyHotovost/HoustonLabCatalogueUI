import { Wrench } from "lucide-react";

export const BrandHeader = ({ totalLinks }) => {
  return (
    <header className="panel-surface flex flex-col gap-6 px-6 py-6 md:flex-row md:items-end md:justify-between md:px-8 md:py-8">
      <div className="flex items-start gap-4">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm"
          data-testid="brand-logo"
        >
          <Wrench className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500" data-testid="brand-badge">
            Interní rozcestník
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl" data-testid="brand-title">
            Autoservis Portál
          </h1>
          <p className="max-w-2xl text-base text-slate-600 md:text-lg" data-testid="brand-subtitle">
            Otevři potřebný katalog nebo web jedním kliknutím. Všechno důležité je hned po ruce.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left md:min-w-[220px] md:text-right">
        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500" data-testid="brand-stats-label">
          Aktivní položky
        </div>
        <div className="mt-1 text-3xl font-bold text-slate-900" data-testid="brand-stats-value">
          {totalLinks}
        </div>
      </div>
    </header>
  );
};
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { SafeLogoImage } from "../SafeLogoImage";
import { Button } from "../ui/button";

export const LinksTable = ({ links, onEdit, onDelete, deletingId }) => {
  if (!links.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500" data-testid="admin-links-empty-state">
        Zatím tu nejsou žádné odkazy.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm" data-testid="admin-links-table-wrapper">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse" data-testid="admin-links-table">
          <thead className="bg-slate-50 text-left text-sm uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-4 font-semibold">Položka</th>
              <th className="px-4 py-4 font-semibold">Kliknutí</th>
              <th className="px-4 py-4 font-semibold">Stav</th>
              <th className="px-4 py-4 font-semibold">Oblíbené</th>
              <th className="px-4 py-4 font-semibold">Poslední úprava</th>
              <th className="px-4 py-4 text-right font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.id} className="border-t border-slate-200" data-testid={`admin-link-row-${link.id}`}>
                <td className="px-4 py-4">
                  <div className="flex min-w-[280px] items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                      <SafeLogoImage
                        src={link.logo_data || link.logo_url}
                        alt={link.title}
                        className="h-full w-full object-contain"
                        imageTestId={`admin-link-logo-image-${link.id}`}
                        fallbackClassName="flex h-full w-full items-center justify-center bg-slate-100 text-xl font-semibold text-slate-500"
                        fallbackContent={<span>{link.title.charAt(0)}</span>}
                        fallbackTestId={`admin-link-logo-fallback-${link.id}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900" data-testid={`admin-link-title-${link.id}`}>
                        {link.title}
                      </div>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                        data-testid={`admin-link-url-${link.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Otevřít web
                      </a>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 font-semibold text-slate-900" data-testid={`admin-link-clicks-${link.id}`}>
                  {link.clicks}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                      link.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                    data-testid={`admin-link-status-${link.id}`}
                  >
                    {link.is_active ? "Aktivní" : "Neaktivní"}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-700" data-testid={`admin-link-favorite-${link.id}`}>
                  {link.is_favorite ? "Ano" : "Ne"}
                </td>
                <td className="px-4 py-4 text-slate-600" data-testid={`admin-link-updated-${link.id}`}>
                  {new Date(link.updated_at).toLocaleString("cs-CZ")}
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      data-testid={`admin-link-edit-${link.id}`}
                      onClick={() => onEdit(link)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Upravit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="rounded-xl"
                      data-testid={`admin-link-delete-${link.id}`}
                      disabled={!!deletingId}
                      onClick={() => onDelete(link)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Smazat
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

const emptyForm = {
  title: "",
  url: "",
  logo_url: "",
  logo_data: "",
  is_active: true,
  is_favorite: false,
};

export const LinkFormDialog = ({ open, onOpenChange, onSubmit, editingLink, loading }) => {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(
      editingLink
        ? {
            title: editingLink.title,
            url: editingLink.url,
            logo_url: editingLink.logo_url || "",
            logo_data: editingLink.logo_data || "",
            is_active: editingLink.is_active,
            is_favorite: editingLink.is_favorite,
          }
        : emptyForm,
    );
  }, [editingLink, open]);

  const preview = useMemo(() => form.logo_data || form.logo_url || "", [form.logo_data, form.logo_url]);

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, logo_data: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      ...form,
      logo_url: form.logo_url.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] border-slate-200 sm:max-w-2xl" data-testid="link-form-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-slate-900" data-testid="link-form-title">
            {editingLink ? "Upravit položku" : "Přidat novou položku"}
          </DialogTitle>
          <DialogDescription className="text-slate-500" data-testid="link-form-description">
            Vyplň název, odkaz a logo. Zaměstnanci na kartě uvidí jen logo a název.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="link-title">
                Název webu
              </label>
              <Input
                id="link-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="h-12 rounded-xl border-slate-200 bg-slate-50 text-base"
                data-testid="link-form-title-input"
                placeholder="Např. Auto Kelly"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="link-url">
                Cílová URL
              </label>
              <Input
                id="link-url"
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                className="h-12 rounded-xl border-slate-200 bg-slate-50 text-base"
                data-testid="link-form-url-input"
                placeholder="https://www.example.cz"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="logo-url">
                Logo přes URL
              </label>
              <Input
                id="logo-url"
                value={form.logo_url}
                onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))}
                className="h-12 rounded-xl border-slate-200 bg-slate-50 text-base"
                data-testid="link-form-logo-url-input"
                placeholder="https://.../logo.png"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="logo-upload">
                Nahrát logo
              </label>
              <label
                htmlFor="logo-upload"
                className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                data-testid="link-form-logo-upload-label"
              >
                <ImagePlus className="h-4 w-4" />
                Vybrat soubor
              </label>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="link-form-logo-upload-input"
                onChange={handleFileUpload}
              />
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4" data-testid="link-form-preview">
            <div className="mb-3 text-sm font-semibold text-slate-700">Náhled loga</div>
            {preview ? (
              <div className="flex items-center gap-4">
                <img src={preview} alt="Logo náhled" className="h-16 w-16 rounded-2xl object-contain bg-white p-2" />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  data-testid="link-form-remove-logo-button"
                  onClick={() => setForm((current) => ({ ...current, logo_data: "", logo_url: "" }))}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Odebrat logo
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-500" data-testid="link-form-preview-empty">
                Pokud logo nevyplníš, použije se čistý placeholder.
              </p>
            )}
          </div>

          <div className="grid gap-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <div className="flex items-center justify-between gap-4" data-testid="link-form-active-row">
              <div>
                <div className="font-semibold text-slate-900">Aktivní položka</div>
                <div className="text-sm text-slate-500">Neaktivní položku lze skrýt z veřejné plochy.</div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
                data-testid="link-form-active-switch"
              />
            </div>

            <div className="flex items-center justify-between gap-4" data-testid="link-form-favorite-row">
              <div>
                <div className="font-semibold text-slate-900">Oblíbená položka</div>
                <div className="text-sm text-slate-500">Připne se nahoru před ostatní odkazy.</div>
              </div>
              <Switch
                checked={form.is_favorite}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, is_favorite: checked }))}
                data-testid="link-form-favorite-switch"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              data-testid="link-form-cancel-button"
              onClick={() => onOpenChange(false)}
            >
              Zrušit
            </Button>
            <Button
              type="submit"
              className="rounded-xl bg-slate-900 hover:bg-slate-800"
              data-testid="link-form-save-button"
              disabled={loading}
            >
              {loading ? "Ukládám..." : editingLink ? "Uložit změny" : "Přidat položku"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
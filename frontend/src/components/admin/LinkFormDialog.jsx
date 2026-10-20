import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { discoverAdminLogo, getApiErrorMessage } from "../../api";
import { SafeLogoImage } from "../SafeLogoImage";
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

export const LinkFormDialog = ({ open, onOpenChange, onSubmit, editingLink, loading, token }) => {
  const [form, setForm] = useState(emptyForm);
  const [autoLogoUrl, setAutoLogoUrl] = useState("");
  const [autoStatus, setAutoStatus] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [autoSuppressed, setAutoSuppressed] = useState(false);
  const uploadVersion = useRef(0);

  useEffect(() => {
    uploadVersion.current += 1;
    if (!open) return;
    setAutoSuppressed(false);
    setDiscovering(false);
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
    setAutoLogoUrl("");
    setAutoStatus("");
  }, [editingLink, open]);

  useEffect(() => {
    let active = true;
    setAutoLogoUrl("");
    setAutoStatus("");
    setDiscovering(false);
    if (!open || !token || !form.url.trim() || autoSuppressed) return undefined;
    const timeout = setTimeout(async () => {
      setDiscovering(true);
      try {
        const result = await discoverAdminLogo(token, form.url.trim());
        if (!active) return;
        if (result?.found && result.logo_url) {
          setAutoLogoUrl(result.logo_url);
          setAutoStatus("Logo načtené automaticky z webu.");
        } else {
          setAutoStatus("Automatické logo se nenašlo. Můžeš nahrát vlastní.");
        }
      } catch (error) {
        if (active) setAutoStatus(getApiErrorMessage(error, "Automatické logo se nepodařilo načíst."));
      } finally {
        if (active) setDiscovering(false);
      }
    }, 700);
    return () => { active = false; clearTimeout(timeout); };
  }, [form.url, open, token, autoSuppressed]);

  const preview = useMemo(() => form.logo_data || form.logo_url || autoLogoUrl || "", [autoLogoUrl, form.logo_data, form.logo_url]);

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"].includes(file.type)) {
      toast.error("Vyber PNG, JPEG, WebP, GIF nebo ICO. SVG není podporováno.");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("Logo může mít nejvýše 1 MB.");
      return;
    }
    const version = ++uploadVersion.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (uploadVersion.current === version) setForm((current) => ({ ...current, logo_data: String(reader.result || "") }));
    };
    reader.onerror = () => toast.error("Soubor se nepodařilo přečíst. Vyber jej znovu.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (!form.title.trim()) {
      toast.error("Vyplň název webu.");
      return;
    }
    try {
      for (const value of [form.url.trim(), form.logo_url.trim()].filter(Boolean)) {
        const parsed = new URL(value.includes("://") ? value : `https://${value}`);
        if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error();
      }
    } catch {
      toast.error("Zadej platnou HTTP nebo HTTPS adresu bez přihlašovacích údajů.");
      return;
    }
    await onSubmit({
      ...form,
      title: form.title.trim(),
      url: form.url.trim(),
      logo_url: form.logo_url.trim() || (autoSuppressed ? "" : autoLogoUrl),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next); }}>
      <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] border-slate-200 sm:max-w-2xl" data-testid="link-form-dialog">
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
                required
                maxLength={80}
                disabled={loading}
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
                required
                maxLength={2048}
                autoComplete="url"
                inputMode="url"
                disabled={loading}
                value={form.url}
                onChange={(event) => { setAutoSuppressed(false); setForm((current) => ({ ...current, url: event.target.value })); }}
                className="h-12 rounded-xl border-slate-200 bg-slate-50 text-base"
                data-testid="link-form-url-input"
                placeholder="https://www.example.cz"
              />
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 md:col-span-2" data-testid="link-form-auto-logo-card">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Automaticky najít logo</div>
                  <div className="text-sm text-slate-500" data-testid="link-form-auto-logo-status">
                    {discovering ? "Hledám favicon / logo…" : autoStatus || "Po zadání URL zkusím logo načíst automaticky."}
                  </div>
                </div>

                {autoLogoUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    data-testid="link-form-use-auto-logo-button"
                    onClick={() => setForm((current) => ({ ...current, logo_url: autoLogoUrl, logo_data: "" }))}
                  >
                    Použít automatické logo
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="logo-url">
                Vlastní logo přes URL
              </label>
              <Input
                id="logo-url"
                maxLength={2048}
                inputMode="url"
                disabled={loading}
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
                accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon"
                disabled={loading}
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
                <SafeLogoImage
                  src={preview}
                  alt="Logo náhled"
                  className="h-16 w-16 rounded-2xl bg-white p-2 object-contain"
                  imageTestId="link-form-preview-image"
                  fallbackClassName="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-500"
                  fallbackTestId="link-form-preview-fallback"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  data-testid="link-form-remove-logo-button"
                  onClick={() => { uploadVersion.current += 1; setAutoSuppressed(true); setAutoLogoUrl(""); setForm((current) => ({ ...current, logo_data: "", logo_url: "" })); }}
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
                disabled={loading}
                aria-label="Aktivní položka"
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
                disabled={loading}
                aria-label="Oblíbená položka"
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
              disabled={loading}
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
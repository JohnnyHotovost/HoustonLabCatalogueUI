import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, LogOut, Plus, Upload, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  changeAdminCredentials,
  clearStoredToken,
  createAdminLink,
  deleteAdminLink,
  exportAdminLinks,
  fetchAdminLinks,
  fetchAdminSettings,
  fetchCurrentAdmin,
  getApiErrorMessage,
  getStoredToken,
  importAdminLinks,
  reorderAdminLinks,
  setStoredToken,
  updateAdminLink,
  updateAdminSettings,
} from "../api";
import { AdminLoginDialog } from "../components/AdminLoginDialog";
import { CredentialsCard } from "../components/admin/CredentialsCard";
import { LinkFormDialog } from "../components/admin/LinkFormDialog";
import { LinksTable } from "../components/admin/LinksTable";
import { SortableOrderList } from "../components/admin/SortableOrderList";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";

const emptySettings = {
  sort_mode: "alphabetical",
  open_in_new_tab: true,
  show_inactive_public: false,
};

export default function AdminPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [token, setToken] = useState(getStoredToken());
  const [adminUser, setAdminUser] = useState(null);
  const [links, setLinks] = useState([]);
  const [customOrderLinks, setCustomOrderLinks] = useState([]);
  const [settingsDraft, setSettingsDraft] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [savingLink, setSavingLink] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

  const loadAdminData = useCallback(async (activeToken = token) => {
    if (!activeToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const [me, loadedLinks, loadedSettings] = await Promise.all([
        fetchCurrentAdmin(activeToken),
        fetchAdminLinks(activeToken),
        fetchAdminSettings(activeToken),
      ]);

      setAdminUser(me);
      setLinks(loadedLinks);
      setCustomOrderLinks([...loadedLinks].sort((a, b) => a.custom_order - b.custom_order));
      setSettingsDraft({
        sort_mode: loadedSettings.sort_mode,
        open_in_new_tab: loadedSettings.open_in_new_tab,
        show_inactive_public: loadedSettings.show_inactive_public,
      });
    } catch (error) {
      if (error?.response?.status === 401) {
        clearStoredToken();
        setToken("");
        toast.error("Administrace vyžaduje nové přihlášení.");
      } else {
        setLoadError(getApiErrorMessage(error, "Administraci se nepodařilo načíst."));
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const stats = useMemo(() => {
    const activeCount = links.filter((link) => link.is_active).length;
    const favoriteCount = links.filter((link) => link.is_favorite).length;
    const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0);
    return [
      { label: "Celkem odkazů", value: links.length, testId: "stats-total-links" },
      { label: "Aktivní", value: activeCount, testId: "stats-active-links" },
      { label: "Oblíbené", value: favoriteCount, testId: "stats-favorite-links" },
      { label: "Kliknutí", value: totalClicks, testId: "stats-total-clicks" },
    ];
  }, [links]);

  const handleLogout = () => {
    clearStoredToken();
    setToken("");
    navigate("/");
  };

  const reportMutationError = (error, fallback) => {
    if (error?.response?.status === 401) {
      clearStoredToken();
      setToken("");
      toast.error("Přihlášení vypršelo. Přihlas se prosím znovu.");
      return;
    }
    toast.error(getApiErrorMessage(error, fallback));
  };

  const handleSaveLink = async (payload) => {
    if (savingLink) return;
    setSavingLink(true);
    try {
      if (editingLink) {
        await updateAdminLink(token, editingLink.id, payload);
        toast.success("Položka byla upravena.");
      } else {
        await createAdminLink(token, payload);
        toast.success("Položka byla přidána.");
      }
      setDialogOpen(false);
      setEditingLink(null);
      await loadAdminData(token);
    } catch (error) {
      reportMutationError(error, "Uložení se nepodařilo.");
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteLink = async (link) => {
    const confirmed = window.confirm(`Opravdu smazat položku „${link.title}“?`);
    if (!confirmed) {
      return;
    }

    if (deletingId) return;
    setDeletingId(link.id);
    try {
      await deleteAdminLink(token, link.id);
      toast.success("Položka byla smazána.");
      await loadAdminData(token);
    } catch (error) {
      reportMutationError(error, "Smazání se nepodařilo.");
    } finally {
      setDeletingId("");
    }
  };

  const handleSaveSettings = async () => {
    if (savingSettings || loading || loadError) return;
    setSavingSettings(true);
    try {
      await updateAdminSettings(token, settingsDraft);
      toast.success("Nastavení bylo uloženo.");
      await loadAdminData(token);
    } catch (error) {
      reportMutationError(error, "Nastavení se nepodařilo uložit.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveOrder = async () => {
    if (savingOrder) return;
    setSavingOrder(true);
    try {
      await reorderAdminLinks(token, customOrderLinks.map((link) => link.id));
      toast.success("Vlastní pořadí bylo uloženo.");
      await loadAdminData(token);
    } catch (error) {
      reportMutationError(error, "Pořadí se nepodařilo uložit.");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await exportAdminLinks(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "katalogovy-rozcestnik-export.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Export je připravený.");
    } catch (error) {
      reportMutationError(error, "Export se nepodařil.");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || importing) return;
    setImporting(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Import může mít nejvýše 10 MB.");
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch { throw new Error("Soubor není platný JSON export."); }
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.links) || !parsed.links.length) throw new Error("Export musí obsahovat seznam odkazů.");
      if (!window.confirm(`Importovat ${parsed.links.length} položek? Shodná ID se aktualizují, ostatní uložené odkazy zůstanou zachované.${parsed.settings ? " Import zahrnuje i nastavení zobrazení." : ""}`)) return;
      await importAdminLinks(token, parsed);
      toast.success("Import byl sloučen s uloženými odkazy.");
      await loadAdminData(token);
    } catch (error) {
      if (error?.response || error?.isAxiosError) reportMutationError(error, "Import se nepodařil. Uložená data zůstala zachovaná.");
      else toast.error(error.message);
    } finally {
      input.value = "";
      setImporting(false);
    }
  };

  const handleCredentialChange = async (payload) => {
    if (savingCredentials) return false;
    setSavingCredentials(true);
    try {
      const data = await changeAdminCredentials(token, payload);
      setStoredToken(data.access_token);
      setToken(data.access_token);
      setAdminUser({ username: data.username });
      toast.success("Admin přihlášení bylo změněno.");
      return true;
    } catch (error) {
      reportMutationError(error, "Změna přihlášení se nepodařila.");
      return false;
    } finally {
      setSavingCredentials(false);
    }
  };

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-10">
        <AdminLoginDialog
          open
          onOpenChange={() => navigate("/")}
          onSuccess={() => setToken(getStoredToken())}
        />
      </main>
    );
  }

  return (
    <main className="page-enter min-h-screen">
      <div className="app-shell flex flex-col gap-6">
        <header className="panel-surface flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8" data-testid="admin-header">
          <div className="space-y-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900"
              data-testid="admin-back-button"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět na rozcestník
            </button>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900" data-testid="admin-page-title">
              Správa rozcestníku
            </h1>
            <p className="text-base text-slate-600" data-testid="admin-page-subtitle">
              Přihlášený admin: <strong>{adminUser?.username || "admin"}</strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              data-testid="admin-export-button"
              disabled={exporting || loading || !!loadError}
              onClick={handleExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              data-testid="admin-import-button"
              disabled={importing || loading || !!loadError}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" data-testid="admin-import-input" onChange={handleImport} />
            <Button
              type="button"
              className="rounded-xl bg-slate-900 hover:bg-slate-800"
              data-testid="admin-add-link-button"
              disabled={loading || !!loadError}
              onClick={() => {
                setEditingLink(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Přidat web
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              data-testid="admin-logout-button"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Odhlásit
            </Button>
          </div>
        </header>

        {loadError ? <section className="panel-surface p-6" role="alert" data-testid="admin-load-error">
          <p>{loadError}</p>
          <Button type="button" className="mt-3" onClick={() => loadAdminData()}>Zkusit znovu</Button>
        </section> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="admin-stats-grid">
          {stats.map((item) => (
            <div key={item.label} className="panel-surface px-5 py-5" data-testid={item.testId}>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
              <div className="mt-2 text-4xl font-bold text-slate-900">{item.value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="panel-surface p-6 md:p-7" data-testid="admin-settings-card">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-slate-900" data-testid="admin-settings-title">
                Nastavení zobrazení
              </h2>
              <p className="text-sm text-slate-500" data-testid="admin-settings-description">
                Urči, jak se mají karty zaměstnancům řadit a otevírat.
              </p>
            </div>

            <div className="grid gap-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Režim řazení</label>
                <Select
                  value={settingsDraft.sort_mode}
                  onValueChange={(value) => setSettingsDraft((current) => ({ ...current, sort_mode: value }))}
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50" data-testid="admin-sort-mode-select">
                    <SelectValue placeholder="Vyber řazení" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alphabetical">Podle abecedy</SelectItem>
                    <SelectItem value="clicks">Podle návštěvnosti</SelectItem>
                    <SelectItem value="custom">Vlastní pořadí</SelectItem>
                    <SelectItem value="latest">Nejnovější nahoře</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4" data-testid="admin-open-new-tab-row">
                <div>
                  <div className="font-semibold text-slate-900">Otevírat odkazy v novém panelu</div>
                  <div className="text-sm text-slate-500">Výchozí chování pro zaměstnance.</div>
                </div>
                <Switch
                  disabled={savingSettings || loading || !!loadError}
                  aria-label="Otevírat odkazy v novém panelu"
                  checked={settingsDraft.open_in_new_tab}
                  onCheckedChange={(checked) => setSettingsDraft((current) => ({ ...current, open_in_new_tab: checked }))}
                  data-testid="admin-open-new-tab-switch"
                />
              </div>

              <div className="flex items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4" data-testid="admin-show-inactive-row">
                <div>
                  <div className="font-semibold text-slate-900">Zobrazit i neaktivní položky veřejně</div>
                  <div className="text-sm text-slate-500">Standardně doporučeno vypnout.</div>
                </div>
                <Switch
                  disabled={savingSettings || loading || !!loadError}
                  aria-label="Zobrazit i neaktivní položky veřejně"
                  checked={settingsDraft.show_inactive_public}
                  onCheckedChange={(checked) => setSettingsDraft((current) => ({ ...current, show_inactive_public: checked }))}
                  data-testid="admin-show-inactive-switch"
                />
              </div>

              <Button
                type="button"
                className="w-full rounded-xl bg-slate-900 hover:bg-slate-800"
                data-testid="admin-save-settings-button"
                onClick={handleSaveSettings}
                disabled={savingSettings || loading || !!loadError}
              >
                {savingSettings ? "Ukládám nastavení..." : "Uložit nastavení"}
              </Button>
            </div>
          </div>

          <CredentialsCard
            currentUsername={adminUser?.username}
            onSubmit={handleCredentialChange}
            loading={savingCredentials || loading || !!loadError}
          />
        </section>

        {settingsDraft.sort_mode === "custom" ? (
          <SortableOrderList
            links={customOrderLinks}
            onChange={setCustomOrderLinks}
            onSave={handleSaveOrder}
            saving={savingOrder}
          />
        ) : null}

        <section className="space-y-4" data-testid="admin-links-section">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900" data-testid="admin-links-title">
              Všechny položky
            </h2>
            <p className="text-sm text-slate-500" data-testid="admin-links-description">
              Kliky, stav i datum poslední změny vidíš jen v administraci.
            </p>
          </div>

          {loading ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-[1.25rem] border border-slate-200 bg-white/70" />
              ))}
            </div>
          ) : (
            <LinksTable
              links={links}
              deletingId={deletingId}
              onEdit={(link) => {
                setEditingLink(link);
                setDialogOpen(true);
              }}
              onDelete={handleDeleteLink}
            />
          )}
        </section>
      </div>

      <LinkFormDialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen);
          if (!nextOpen) {
            setEditingLink(null);
          }
        }}
        onSubmit={handleSaveLink}
        editingLink={editingLink}
        loading={savingLink}
        token={token}
      />
    </main>
  );
}
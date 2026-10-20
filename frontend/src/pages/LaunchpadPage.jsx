import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  clearStoredToken,
  fetchCurrentAdmin,
  fetchLaunchpad,
  getApiErrorMessage,
  getStoredToken,
  trackLinkClick,
} from "../api";
import { AdminAccessButton } from "../components/AdminAccessButton";
import { AdminLoginDialog } from "../components/AdminLoginDialog";
import { LinkCard } from "../components/LinkCard";
import { SearchBar } from "../components/SearchBar";
import { SortableLaunchpadGrid } from "../components/SortableLaunchpadGrid";

import { applyLocalOrder, LOCAL_CUSTOM_ORDER_KEY, readLocalOrder, sortLinks } from "../lib/launchpad";

export default function LaunchpadPage() {
  const navigate = useNavigate();
  const [launchpad, setLaunchpad] = useState({ links: [], settings: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("alphabetical");
  const [loginOpen, setLoginOpen] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [customUnlocked, setCustomUnlocked] = useState(false);
  const [customDraftLinks, setCustomDraftLinks] = useState([]);
  const [savingCustomOrder, setSavingCustomOrder] = useState(false);
  const [localCustomOrderIds, setLocalCustomOrderIds] = useState(readLocalOrder);

  useEffect(() => {
    const validateAdmin = async () => {
      const storedToken = getStoredToken();
      if (!storedToken) {
        return;
      }

      try {
        await fetchCurrentAdmin(storedToken);
        setAdminToken(storedToken);
      } catch (error) {
        if (error?.response?.status === 401) clearStoredToken();
      }
    };

    const loadLaunchpad = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const data = await fetchLaunchpad();
        setLaunchpad(data);
        setSortMode(data.settings?.sort_mode || "alphabetical");
      } catch (error) {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    loadLaunchpad();
    validateAdmin();
  }, [loadAttempt]);

  useEffect(() => {
    const baseCustomLinks = sortLinks(launchpad.links, "custom");
    setCustomDraftLinks(
      applyLocalOrder(baseCustomLinks, localCustomOrderIds),
    );
  }, [launchpad.links, localCustomOrderIds]);

  useEffect(() => {
    if (sortMode !== "custom") {
      setCustomUnlocked(false);
    }
  }, [sortMode]);

  const filteredLinks = useMemo(() => {
    const sourceLinks =
      sortMode === "custom"
        ? applyLocalOrder(sortLinks(launchpad.links, "custom"), localCustomOrderIds)
        : sortLinks(launchpad.links, sortMode);

    const visibleLinks = sourceLinks.filter((link) =>
      link.title.toLowerCase().includes(search.trim().toLowerCase()),
    );
    return sortMode === "custom" ? visibleLinks : sortLinks(visibleLinks, sortMode);
  }, [launchpad.links, localCustomOrderIds, search, sortMode]);

  const handleOpenAdmin = () => {
    if (adminToken) {
      navigate("/admin");
      return;
    }
    setLoginOpen(true);
  };

  const handleLinkClick = (link) => trackLinkClick(link.id);

  const handleToggleCustomOrder = async () => {
    if (sortMode !== "custom") {
      return;
    }

    if (!customUnlocked) {
      setSearch("");
      setCustomDraftLinks(
        applyLocalOrder(sortLinks(launchpad.links, "custom"), localCustomOrderIds),
      );
      setCustomUnlocked(true);
      return;
    }

    setSavingCustomOrder(true);
    try {
      const orderedIds = customDraftLinks.map((link) => link.id);
      // Never send a public personal order to the shared catalogue.
      window.localStorage.setItem(LOCAL_CUSTOM_ORDER_KEY, JSON.stringify(orderedIds));
      setLocalCustomOrderIds(orderedIds);
      setCustomUnlocked(false);
      toast.success("Pořadí bylo uloženo v tomto prohlížeči.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Pořadí se nepodařilo uložit."));
    } finally {
      setSavingCustomOrder(false);
    }
  };

  const handleResetLocalCustomOrder = () => {
    try {
      window.localStorage.removeItem(LOCAL_CUSTOM_ORDER_KEY);
    } catch {
      toast.error("Prohlížeč nepovoluje uložení místního pořadí.");
      return;
    }
    setLocalCustomOrderIds([]);
    setCustomUnlocked(false);
    setCustomDraftLinks(sortLinks(launchpad.links, "custom"));
    toast.success("Lokální pořadí bylo vráceno na výchozí.");
  };

  return (
    <main className="launchpad-page page-enter min-h-screen">
      <div className="app-shell flex min-h-screen flex-col gap-8 pt-8 md:pt-10">
        <SearchBar
          value={search}
          onChange={setSearch}
          sortMode={sortMode}
          onSortChange={setSortMode}
          showCustomLock={sortMode === "custom"}
          customUnlocked={customUnlocked}
          onToggleCustomLock={handleToggleCustomOrder}
          customLockDisabled={savingCustomOrder}
          showCustomReset={sortMode === "custom"}
          onResetCustomOrder={handleResetLocalCustomOrder}
        />

        <div className="catalogue-result-row" aria-live="polite">
          <span>{loading ? "Načítání odkazů…" : loadError ? "Rozcestník není dostupný" : `${filteredLinks.length} ${filteredLinks.length === 1 ? "odkaz" : filteredLinks.length > 1 && filteredLinks.length < 5 ? "odkazy" : "odkazů"}`}</span>
          {sortMode === "custom" ? <span>Vlastní pořadí platí jen v tomto prohlížeči.</span> : null}
        </div>

        {loadError ? (
          <section role="alert" className="panel-surface mx-auto max-w-2xl px-6 py-10 text-center" data-testid="launchpad-error-state">
            <h2 className="text-lg font-semibold">Rozcestník se nepodařilo načíst</h2>
            <p className="mt-2 text-slate-600">Zkontroluj připojení a zkus to znovu.</p>
            <button type="button" className="mt-4 rounded-xl bg-slate-900 px-5 py-3 text-white" onClick={() => setLoadAttempt((value) => value + 1)}>Zkusit znovu</button>
          </section>
        ) : loading ? (
          <section
            className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-8"
            data-testid="launchpad-grid"
          >
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="aspect-square animate-pulse rounded-[1.5rem] border border-slate-200 bg-white/70"
                data-testid={`launchpad-skeleton-${index}`}
              />
            ))}
          </section>
        ) : customUnlocked ? (
          <SortableLaunchpadGrid links={customDraftLinks} onChange={setCustomDraftLinks} />
        ) : (
          <section
            className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-8"
            data-testid="launchpad-grid"
          >
            {filteredLinks.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                openInNewTab={launchpad.settings?.open_in_new_tab}
                onClick={() => handleLinkClick(link)}
              />
            ))}
          </section>
        )}

        {!loading && !loadError && !filteredLinks.length ? (
          <div
            className="panel-surface mx-auto max-w-2xl px-6 py-10 text-center text-lg text-slate-600"
            data-testid="launchpad-empty-state"
          >
            Pro tento výraz jsem nic nenašel. Zkus jednodušší název webu.
          </div>
        ) : null}
      </div>

      <AdminAccessButton onClick={handleOpenAdmin} />
      <AdminLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          setLoginOpen(false);
          const storedToken = getStoredToken();
          setAdminToken(storedToken);
        }}
      />
    </main>
  );
}
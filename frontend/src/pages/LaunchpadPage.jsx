import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  clearStoredToken,
  fetchAdminLinks,
  fetchCurrentAdmin,
  fetchLaunchpad,
  getApiErrorMessage,
  getStoredToken,
  reorderAdminLinks,
  trackLinkClick,
} from "../api";
import { AdminAccessButton } from "../components/AdminAccessButton";
import { AdminLoginDialog } from "../components/AdminLoginDialog";
import { LinkCard } from "../components/LinkCard";
import { SearchBar } from "../components/SearchBar";
import { SortableLaunchpadGrid } from "../components/SortableLaunchpadGrid";

const sortLinks = (links, sortMode) => {
  const sorted = [...links];

  if (sortMode === "clicks") {
    sorted.sort((first, second) => second.clicks - first.clicks || first.title.localeCompare(second.title, "cs"));
  } else if (sortMode === "latest") {
    sorted.sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
  } else if (sortMode === "custom") {
    sorted.sort((first, second) => first.custom_order - second.custom_order || first.title.localeCompare(second.title, "cs"));
  } else {
    sorted.sort((first, second) => first.title.localeCompare(second.title, "cs"));
  }

  if (sortMode === "custom") {
    return sorted;
  }

  const favorites = sorted.filter((link) => link.is_favorite);
  const regular = sorted.filter((link) => !link.is_favorite);
  return [...favorites, ...regular];
};

export default function LaunchpadPage() {
  const navigate = useNavigate();
  const [launchpad, setLaunchpad] = useState({ links: [], settings: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("alphabetical");
  const [loginOpen, setLoginOpen] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLinks, setAdminLinks] = useState([]);
  const [customUnlocked, setCustomUnlocked] = useState(false);
  const [customDraftLinks, setCustomDraftLinks] = useState([]);
  const [savingCustomOrder, setSavingCustomOrder] = useState(false);

  useEffect(() => {
    const validateAdmin = async () => {
      const storedToken = getStoredToken();
      if (!storedToken) {
        return;
      }

      try {
        await fetchCurrentAdmin(storedToken);
        const loadedAdminLinks = await fetchAdminLinks(storedToken);
        setAdminToken(storedToken);
        setIsAdmin(true);
        setAdminLinks(loadedAdminLinks);
      } catch (error) {
        clearStoredToken();
      }
    };

    const loadLaunchpad = async () => {
      try {
        const data = await fetchLaunchpad();
        setLaunchpad(data);
        setSortMode(data.settings?.sort_mode || "alphabetical");
      } catch (error) {
        toast.error("Nepodařilo se načíst rozcestník.");
      } finally {
        setLoading(false);
      }
    };

    loadLaunchpad();
    validateAdmin();
  }, []);

  useEffect(() => {
    setCustomDraftLinks(sortLinks(launchpad.links, "custom"));
  }, [launchpad.links]);

  useEffect(() => {
    if (sortMode !== "custom") {
      setCustomUnlocked(false);
    }
  }, [sortMode]);

  const filteredLinks = useMemo(() => {
    const visibleLinks = launchpad.links.filter((link) =>
      link.title.toLowerCase().includes(search.trim().toLowerCase()),
    );
    return sortLinks(visibleLinks, sortMode);
  }, [launchpad.links, search, sortMode]);

  const handleOpenAdmin = () => {
    if (adminToken) {
      navigate("/admin");
      return;
    }
    setLoginOpen(true);
  };

  const handleLinkClick = async (link) => {
    try {
      await trackLinkClick(link.id);
    } catch (error) {
      console.error(error);
    }

    if (launchpad.settings?.open_in_new_tab) {
      window.open(link.url, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.assign(link.url);
  };

  const handleToggleCustomOrder = async () => {
    if (!isAdmin || sortMode !== "custom") {
      return;
    }

    if (!customUnlocked) {
      setSearch("");
      setCustomUnlocked(true);
      return;
    }

    setSavingCustomOrder(true);
    try {
      const visibleIds = customDraftLinks.map((link) => link.id);
      const hiddenIds = adminLinks
        .filter((link) => !visibleIds.includes(link.id))
        .sort((first, second) => first.custom_order - second.custom_order)
        .map((link) => link.id);

      await reorderAdminLinks(adminToken, [...visibleIds, ...hiddenIds]);
      const refreshedLaunchpad = await fetchLaunchpad();
      const refreshedAdminLinks = await fetchAdminLinks(adminToken);
      setLaunchpad(refreshedLaunchpad);
      setAdminLinks(refreshedAdminLinks);
      setCustomDraftLinks(sortLinks(refreshedLaunchpad.links, "custom"));
      setCustomUnlocked(false);
      toast.success("Vlastní pořadí bylo uloženo.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Pořadí se nepodařilo uložit."));
    } finally {
      setSavingCustomOrder(false);
    }
  };

  return (
    <main className="page-enter min-h-screen">
      <div className="app-shell flex min-h-screen flex-col gap-8 pt-8 md:pt-10">
        <SearchBar
          value={search}
          onChange={setSearch}
          sortMode={sortMode}
          onSortChange={setSortMode}
          showCustomLock={sortMode === "custom" && isAdmin}
          customUnlocked={customUnlocked}
          onToggleCustomLock={handleToggleCustomOrder}
          customLockDisabled={savingCustomOrder}
        />

        {loading ? (
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
            {filteredLinks.map((link, index) => (
              <LinkCard
                key={link.id}
                index={index}
                link={link}
                onClick={() => handleLinkClick(link)}
              />
            ))}
          </section>
        )}

        {!loading && !filteredLinks.length ? (
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
          setAdminToken(getStoredToken());
          setIsAdmin(true);
          navigate("/admin");
        }}
      />
    </main>
  );
}
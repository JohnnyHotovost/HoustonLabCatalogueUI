import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { fetchLaunchpad, getStoredToken, trackLinkClick } from "../api";
import { AdminAccessButton } from "../components/AdminAccessButton";
import { AdminLoginDialog } from "../components/AdminLoginDialog";
import { BrandHeader } from "../components/BrandHeader";
import { LinkCard } from "../components/LinkCard";
import { SearchBar } from "../components/SearchBar";

export default function LaunchpadPage() {
  const navigate = useNavigate();
  const [launchpad, setLaunchpad] = useState({ links: [], settings: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const loadLaunchpad = async () => {
      try {
        const data = await fetchLaunchpad();
        setLaunchpad(data);
      } catch (error) {
        toast.error("Nepodařilo se načíst rozcestník.");
      } finally {
        setLoading(false);
      }
    };

    loadLaunchpad();
  }, []);

  const filteredLinks = useMemo(() => {
    return launchpad.links.filter((link) =>
      link.title.toLowerCase().includes(search.trim().toLowerCase()),
    );
  }, [launchpad.links, search]);

  const handleOpenAdmin = () => {
    if (getStoredToken()) {
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

  return (
    <main className="page-enter min-h-screen">
      <div className="app-shell flex min-h-screen flex-col gap-10">
        <BrandHeader totalLinks={launchpad.links.length} />

        <SearchBar value={search} onChange={setSearch} />

        <section
          className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-8"
          data-testid="launchpad-grid"
        >
          {loading
            ? Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="aspect-square animate-pulse rounded-[1.5rem] border border-slate-200 bg-white/70"
                  data-testid={`launchpad-skeleton-${index}`}
                />
              ))
            : filteredLinks.map((link, index) => (
                <LinkCard
                  key={link.id}
                  index={index}
                  link={link}
                  onClick={() => handleLinkClick(link)}
                />
              ))}
        </section>

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
          navigate("/admin");
        }}
      />
    </main>
  );
}
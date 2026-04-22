import { Globe2 } from "lucide-react";

export const LinkCard = ({ link, onClick, index }) => {
  const logoSrc = link.logo_data || link.logo_url;

  return (
    <button
      type="button"
      onClick={onClick}
      className="tile-enter soft-ring aspect-square rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
      style={{ animationDelay: `${index * 35}ms` }}
      data-testid={`launchpad-card-${link.id}`}
    >
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center" data-testid={`launchpad-card-logo-${link.id}`}>
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={link.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-[1.4rem] bg-slate-100 text-slate-500">
              <Globe2 className="h-10 w-10" />
            </div>
          )}
        </div>

        <div className="line-clamp-2 text-lg font-semibold leading-tight text-slate-900 md:text-xl" data-testid={`launchpad-card-title-${link.id}`}>
          {link.title}
        </div>
      </div>
    </button>
  );
};
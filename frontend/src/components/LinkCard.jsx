import { Globe2, GripHorizontal } from "lucide-react";
import { SafeLogoImage } from "./SafeLogoImage";

export const LinkCard = ({ link, onClick, index, dragEnabled = false }) => {
  const logoSrc = link.logo_data || link.logo_url;
  const cardClassName = `tile-enter soft-ring aspect-square rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center transition-all duration-200 ${
    dragEnabled
      ? "cursor-grab border-dashed border-blue-200 bg-blue-50/40 shadow-md"
      : "hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
  }`;

  const content = (
    <>
      {dragEnabled ? (
        <div className="absolute right-4 top-4 rounded-full bg-white/80 p-1.5 text-slate-400" data-testid={`launchpad-card-drag-handle-${link.id}`}>
          <GripHorizontal className="h-4 w-4" />
        </div>
      ) : null}
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center" data-testid={`launchpad-card-logo-${link.id}`}>
          <SafeLogoImage
            src={logoSrc}
            alt={link.title}
            className="h-full w-full object-contain"
            imageTestId={`launchpad-card-logo-image-${link.id}`}
            fallbackClassName="flex h-full w-full items-center justify-center rounded-[1.4rem] bg-slate-100 text-slate-500"
            fallbackContent={<Globe2 className="h-10 w-10" />}
            fallbackTestId={`launchpad-card-logo-fallback-${link.id}`}
          />
        </div>

        <div className="line-clamp-2 text-lg font-semibold leading-tight text-slate-900 md:text-xl" data-testid={`launchpad-card-title-${link.id}`}>
          {link.title}
        </div>
      </div>
    </>
  );

  if (dragEnabled) {
    return (
      <div className={cardClassName} style={{ animationDelay: `${index * 35}ms` }} data-testid={`launchpad-card-${link.id}`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cardClassName}
      style={{ animationDelay: `${index * 35}ms` }}
      data-testid={`launchpad-card-${link.id}`}
    >
      {content}
    </button>
  );
};
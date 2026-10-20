import { Globe2, GripHorizontal } from "lucide-react";
import { SafeLogoImage } from "./SafeLogoImage";

export const LinkCard = ({ link, onClick, dragEnabled = false, openInNewTab = false }) => {
  const logoSrc = link.logo_data || link.logo_url;
  const cardClassName = `catalogue-card${dragEnabled ? " catalogue-card-draggable" : ""}`;

  const content = (
    <>
      {dragEnabled ? (
        <div className="absolute right-4 top-4 rounded-full bg-white/80 p-1.5 text-slate-400" data-testid={`launchpad-card-drag-handle-${link.id}`}>
          <GripHorizontal className="h-4 w-4" />
        </div>
      ) : null}
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <div className="catalogue-card-logo" data-testid={`launchpad-card-logo-${link.id}`}>
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

        <div className="catalogue-card-title" data-testid={`launchpad-card-title-${link.id}`}>
          {link.title}
        </div>
      </div>
    </>
  );

  if (dragEnabled) {
    return (
      <div className={cardClassName} data-testid={`launchpad-card-${link.id}`}>
        {content}
      </div>
    );
  }

  return (
    <a
      href={link.url}
      target={openInNewTab ? "_blank" : undefined}
      rel="noopener noreferrer"
      onClick={onClick}
      onAuxClick={(event) => { if (event.button === 1) onClick?.(event); }}
      className={cardClassName}
      data-testid={`launchpad-card-${link.id}`}
    >
      {content}
    </a>
  );
};
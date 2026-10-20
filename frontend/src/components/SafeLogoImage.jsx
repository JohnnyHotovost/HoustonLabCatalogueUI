import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";

export const isSafeLogoSource = (src) => {
  if (typeof src !== "string") return false;
  if (/^data:image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/i.test(src)) return true;
  try { return ["http:", "https:"].includes(new URL(src).protocol); } catch { return false; }
};

export const SafeLogoImage = ({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackContent,
  imageTestId,
  fallbackTestId,
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!isSafeLogoSource(src) || hasError) {
    return (
      <div className={fallbackClassName} data-testid={fallbackTestId}>
        {fallbackContent || <Globe2 className="h-8 w-8" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      alt={alt}
      className={className}
      data-testid={imageTestId}
      onError={() => setHasError(true)}
    />
  );
};
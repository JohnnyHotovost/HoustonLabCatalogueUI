import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";

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

  if (!src || hasError) {
    return (
      <div className={fallbackClassName} data-testid={fallbackTestId}>
        {fallbackContent || <Globe2 className="h-8 w-8" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      data-testid={imageTestId}
      onError={() => setHasError(true)}
    />
  );
};
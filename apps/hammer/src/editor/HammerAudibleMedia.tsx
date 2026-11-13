import type { ComponentPropsWithRef } from "react";

/** CORS must be configured on the element before React installs its source. */
export function HammerAudibleMedia({ src, ...props }: Omit<ComponentPropsWithRef<"video">, "crossOrigin">) {
  // The synchronized transcript is rendered beside the preview.
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <video {...props} crossOrigin="anonymous" src={src} />;
}

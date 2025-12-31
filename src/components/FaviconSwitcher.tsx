import * as React from "react";
import { useLocation } from "react-router-dom";

/** Update or create a <link> in <head> */
function setIcon(rel: string, href: string, sizes?: string) {
  const selector = sizes ? `link[rel="${rel}"][sizes="${sizes}"]` : `link[rel="${rel}"]`;
  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    if (sizes) link.sizes = sizes;
    document.head.appendChild(link);
  }
  link.href = href;
}

const routeToIcon = (pathname: string): string => {
  // Map by prefix; adjust as you like
  if (pathname.startsWith("/poster")) return "/favicons/poster.ico";
  if (pathname.startsWith("/tester")) return "/favicons/tester.ico";
  if (pathname.startsWith("/manager")) return "/favicons/manager.ico";
  if (pathname.startsWith("/utilities")) return "/favicons/utilities.ico";
  if (pathname.startsWith("/")) return "/favicons/hub.ico";
  return "/favicon.ico"; // default
};

export default function FaviconSwitcher() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const icon = routeToIcon(pathname);
    // Standard favicon(s)
    setIcon("icon", icon);
    setIcon("shortcut icon", icon);
    // Touch icon (optional)
    setIcon("apple-touch-icon", icon);
    // If you ship PNG sizes, uncomment these lines:
    // setIcon("icon", "/favicons/<16x16>.png", "16x16");
    // setIcon("icon", "/favicons/<32x32>.png", "32x32");
    // setIcon("icon", "/favicons/<180x180>.png", "180x180");
  }, [pathname]);

  return null;
}

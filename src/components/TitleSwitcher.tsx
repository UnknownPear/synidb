import * as React from "react";
import { useLocation, useParams } from "react-router-dom";

const titleFor = (pathname: string): string => {
  // Map prefixes → readable titles
  if (pathname.startsWith("/poster"))    return "Poster Ops · Synergy Core";
  if (pathname.startsWith("/tester"))    return "Tester Ops · Synergy Core";
  if (pathname.startsWith("/manager"))   return "Manager Ops · Synergy Core";
  if (pathname.startsWith("/utilities")) return "Utilities Ops · Synergy Core";
  if (pathname.startsWith("/"))   return "Synergy Core Hub";
  return "Synergy Stock Dashboard"; // default
};

export default function TitleSwitcher() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);

  return null;
}

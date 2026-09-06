// ORACLELESS - hash router. Routes:
//   /                       landing page
//   /app                    dashboard shell (defaults to create)
//   /app/create             create a condition
//   /app/conditions         recent conditions
//   /app/condition/:id      condition proof page
//   /app/verify             verify a condition from chain state
//   /app/docs               how it works

import { useEffect, useState } from "react";

export function currentRoute(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export function nav(h: string) {
  window.location.hash = h;
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

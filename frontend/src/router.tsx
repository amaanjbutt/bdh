import { QueryClient } from "@tanstack/react-query";
import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading a page's data when the pointer rests on a link (or it's touched), so most
    // clicks land on data that is already here. Loaders read through React Query, whose
    // staleTime decides whether a preload refetches.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Search params stay plain text: ?code=62032200, not ?code=%2262032200%22 (the default JSON
    // serializer quotes any string that looks like a number). Every route's validateSearch
    // coerces its own types; quotes on old shared links are dropped.
    parseSearch: parseSearchWith((v: string) => (v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v)),
    stringifySearch: stringifySearchWith(JSON.stringify),
  });

  return router;
};

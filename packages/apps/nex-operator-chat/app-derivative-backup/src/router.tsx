import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserHistory, createRouter, type RouterHistory } from "@tanstack/react-router";
import { APP_DISPLAY_NAME } from "./branding";
import { Route as RootRoute } from "./routes/__root";
import { Route as ChatIndexRoute } from "./routes/_chat.index";

const routeTree = RootRoute.addChildren([ChatIndexRoute]);

export function getRouter(
  history: RouterHistory = createBrowserHistory(),
  options?: { basepath?: string },
) {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree,
    history,
    ...(options?.basepath ? { basepath: options.basepath } : {}),
    context: {
      queryClient,
    },
    Wrap: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

export { APP_DISPLAY_NAME };

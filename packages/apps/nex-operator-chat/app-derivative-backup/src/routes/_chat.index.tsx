import { createRoute } from "@tanstack/react-router";
import { ChatView } from "../components/ChatView";
import { Route as RootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: ChatView,
});

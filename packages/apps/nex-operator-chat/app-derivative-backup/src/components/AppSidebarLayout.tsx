import type { ReactNode } from "react";
import {
  Sidebar as SidebarSurface,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "./ui/sidebar";

export function AppSidebarLayout(props: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <SidebarSurface
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground"
        resizable={{
          minWidth: 13 * 16,
          shouldAcceptWidth: ({ nextWidth, wrapper }) => wrapper.clientWidth - nextWidth >= 40 * 16,
          storageKey: "nex_operator_chat_sidebar_width",
        }}
      >
        {props.sidebar}
        <SidebarRail />
      </SidebarSurface>
      <SidebarInset className="min-h-0 bg-background">{props.children}</SidebarInset>
    </SidebarProvider>
  );
}

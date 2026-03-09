"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Overview", href: "/app/glowbot" },
  { label: "Funnel", href: "/app/glowbot/funnel" },
  { label: "Modeling", href: "/app/glowbot/modeling" },
  { label: "Agents", href: "/app/glowbot/agents" },
  { label: "Integrations", href: "/app/glowbot/integrations" },
];

function GlowBotLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="2" y="2" width="24" height="24" rx="6" fill="#d4a853" opacity="0.12" />
        <rect x="2" y="2" width="24" height="24" rx="6" stroke="#d4a853" strokeWidth="1.2" fill="none" />
        <path d="M14 8l5 3.5v5L14 20l-5-3.5v-5L14 8z" fill="#d4a853" opacity="0.25" />
        <circle cx="14" cy="14" r="2.5" fill="#d4a853" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-gb-text">
        GlowBot
      </span>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-gb-border bg-gb-nav/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-10 px-6">
        <Link href="/app/glowbot">
          <GlowBotLogo />
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/app/glowbot"
                ? pathname === "/app/glowbot" || pathname === "/app/glowbot/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-[0.82rem] font-medium transition-colors ${
                  isActive
                    ? "bg-gb-gold-glow text-gb-gold"
                    : "text-gb-muted hover:bg-gb-raised hover:text-gb-text"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

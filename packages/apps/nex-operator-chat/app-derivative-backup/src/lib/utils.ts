import { cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Parameters<typeof cx>) {
  return twMerge(cx(...inputs));
}

export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `nex-${Math.random().toString(36).slice(2, 10)}`;
}

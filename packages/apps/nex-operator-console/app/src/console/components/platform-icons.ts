import { html } from "lit";

export const platformIcons: Record<string, ReturnType<typeof html>> = {
  google: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.8 12.23c0-.68-.06-1.33-.18-1.95H12v3.69h5.5a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.94-1.79 3.04-4.42 3.04-7.38z" fill="#4285F4"/>
    <path d="M12 22c2.75 0 5.05-.91 6.73-2.47l-3.3-2.56c-.91.61-2.08.97-3.43.97-2.64 0-4.88-1.78-5.68-4.18H2.9v2.63A10 10 0 0 0 12 22z" fill="#34A853"/>
    <path d="M6.32 13.76A5.99 5.99 0 0 1 6 12c0-.61.11-1.2.32-1.76V7.61H2.9A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.39l3.24-2.63z" fill="#FBBC05"/>
    <path d="M12 6.06c1.5 0 2.84.52 3.9 1.54l2.92-2.92C17.04 3.05 14.75 2 12 2A10 10 0 0 0 2.9 7.61l3.42 2.63c.8-2.4 3.04-4.18 5.68-4.18z" fill="#EA4335"/>
  </svg>`,

  gmail: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 6v12h4V10l6 4 6-4v8h4V6l-2-2H4L2 6z" fill="#EA4335"/>
    <path d="M6 10l6 4 6-4V6l-6 4-6-4v4z" fill="#C5221F"/>
  </svg>`,

  "google-calendar": html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="#4285F4"/>
    <rect x="5" y="8" width="14" height="12" rx="1" fill="#fff"/>
    <text x="12" y="18" text-anchor="middle" font-size="9" font-weight="700" fill="#4285F4" font-family="Arial, sans-serif">31</text>
  </svg>`,

  notion: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="2" width="18" height="20" rx="2" fill="currentColor" opacity="0.1"/>
    <path d="M7 5h6l4 3v11H7V5z" fill="currentColor" opacity="0.15"/>
    <text x="12" y="17" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="serif">N</text>
  </svg>`,

  "google-drive": html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 2l-6 10h6l6-10H8z" fill="#0F9D58"/>
    <path d="M14 2l6 10h-6l-6-10h6z" fill="#F4B400"/>
    <path d="M2 12l3 5.5h14l3-5.5H2z" fill="#4285F4"/>
    <path d="M8 12l3 5.5h-3L2 12h6z" fill="#0F9D58" opacity="0.8"/>
  </svg>`,

  slack: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="2" width="4" height="8" rx="2" fill="#36C5F0"/>
    <rect x="2" y="10" width="8" height="4" rx="2" fill="#2EB67D"/>
    <rect x="14" y="10" width="8" height="4" rx="2" fill="#E01E5A"/>
    <rect x="10" y="14" width="4" height="8" rx="2" fill="#ECB22E"/>
    <circle cx="6" cy="6" r="2" fill="#36C5F0"/>
    <circle cx="18" cy="6" r="2" fill="#E01E5A"/>
    <circle cx="6" cy="18" r="2" fill="#2EB67D"/>
    <circle cx="18" cy="18" r="2" fill="#ECB22E"/>
  </svg>`,

  github: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.607.069-.607 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.337-2.22-.252-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" fill="currentColor"/>
  </svg>`,

  bitbucket: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 4h18l-2.4 15.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L3 4z" fill="#2684FF"/>
    <path d="M14.4 14H9.6l-.9-5h6.6l-.9 5z" fill="#0052CC"/>
  </svg>`,

  confluence: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.5 7.5c1.6-1.6 4.2-1.6 5.8 0l1.1 1.1-2 2-1.1-1.1a1.2 1.2 0 0 0-1.6 0l-3.5 3.5a1.2 1.2 0 0 0 0 1.6l1.1 1.1-2 2-1.1-1.1a4.1 4.1 0 0 1 0-5.8l3.5-3.5z" fill="#2684FF"/>
    <path d="M16.5 16.5c-1.6 1.6-4.2 1.6-5.8 0l-1.1-1.1 2-2 1.1 1.1a1.2 1.2 0 0 0 1.6 0l3.5-3.5a1.2 1.2 0 0 0 0-1.6l-1.1-1.1 2-2 1.1 1.1a4.1 4.1 0 0 1 0 5.8l-3.5 3.5z" fill="#0052CC"/>
  </svg>`,

  jira: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 12l10 10 10-10L12 2zm0 3l7 7-7 7-7-7 7-7z" fill="#0052CC"/>
    <path d="M12 5l7 7-7 7-7-7 7-7z" fill="#0052CC"/>
    <path d="M12 8l4 4-4 4-4-4 4-4z" fill="#2684FF"/>
  </svg>`,

  stripe: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#635BFF"/>
    <path d="M13.5 8.4c-1.2 0-2 .5-2 1.4 0 2.8 5 2 5 5.2 0 2-1.7 3-4 3-1 0-2.2-.3-3-.7l.5-2c.8.4 1.8.7 2.5.7 1 0 1.6-.4 1.6-1.1 0-2.9-5-1.9-5-5.3 0-2 1.6-3.1 3.8-3.1 1 0 2 .2 2.8.5l-.5 2c-.7-.3-1.5-.6-1.7-.6z" fill="#fff"/>
  </svg>`,

  salesforce: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 6.5a4 4 0 014.5-.5A4.5 4.5 0 0118 4a5 5 0 015 5c0 .5-.1 1-.2 1.5a4 4 0 01-1.3 7.5H5a4 4 0 01-1.5-7.7A5 5 0 019 6.5z" fill="#00A1E0"/>
  </svg>`,

  hubspot: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="3" fill="#FF7A59"/>
    <circle cx="12" cy="4" r="2" fill="#FF7A59"/>
    <circle cx="12" cy="20" r="2" fill="#FF7A59"/>
    <circle cx="5" cy="8" r="2" fill="#FF7A59"/>
    <circle cx="19" cy="8" r="2" fill="#FF7A59"/>
    <circle cx="5" cy="16" r="2" fill="#FF7A59"/>
    <circle cx="19" cy="16" r="2" fill="#FF7A59"/>
    <line x1="12" y1="6" x2="12" y2="9" stroke="#FF7A59" stroke-width="1.5"/>
    <line x1="12" y1="15" x2="12" y2="18" stroke="#FF7A59" stroke-width="1.5"/>
    <line x1="7" y1="8.5" x2="9.5" y2="10.5" stroke="#FF7A59" stroke-width="1.5"/>
    <line x1="14.5" y1="13.5" x2="17" y2="15.5" stroke="#FF7A59" stroke-width="1.5"/>
    <line x1="7" y1="15.5" x2="9.5" y2="13.5" stroke="#FF7A59" stroke-width="1.5"/>
    <line x1="14.5" y1="10.5" x2="17" y2="8.5" stroke="#FF7A59" stroke-width="1.5"/>
  </svg>`,

  asana: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="7" r="4" fill="#F06A6A"/>
    <circle cx="5" cy="16" r="4" fill="#F06A6A"/>
    <circle cx="19" cy="16" r="4" fill="#F06A6A"/>
  </svg>`,

  "google-maps": html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#34A853"/>
    <circle cx="12" cy="9" r="3" fill="#fff"/>
  </svg>`,
  discord: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 5.5A16 16 0 0 0 16.1 4l-.2.5A14.5 14.5 0 0 1 20 6.2a14.3 14.3 0 0 1 1.5 10.7 16.7 16.7 0 0 1-3.4 1.7l-.7-1.1c.6-.2 1.2-.5 1.7-.9a8.1 8.1 0 0 1-6.2 2.4 8.1 8.1 0 0 1-6.2-2.4c.5.4 1.1.7 1.7.9l-.7 1.1A16.7 16.7 0 0 1 2.5 16.9 14.3 14.3 0 0 1 4 6.2a14.5 14.5 0 0 1 4.1-1.7L7.9 4A16 16 0 0 0 4 5.5c-2.4 3.6-3 7.2-2.7 10.7A16.4 16.4 0 0 0 6 20l1-1.7c1 .7 2.1 1.2 3.2 1.5.8.2 1.7.2 2.5.2.8 0 1.7 0 2.5-.2 1.1-.3 2.2-.8 3.2-1.5l1 1.7a16.4 16.4 0 0 0 4.7-3.8c.3-3.5-.3-7.1-2.7-10.7z" fill="#5865F2"/>
    <circle cx="9.3" cy="12.1" r="1.2" fill="#fff"/>
    <circle cx="14.7" cy="12.1" r="1.2" fill="#fff"/>
  </svg>`,

  linkedin: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="3" fill="#0A66C2"/>
    <rect x="6.2" y="9.3" width="2.4" height="8.4" fill="#fff"/>
    <circle cx="7.4" cy="6.8" r="1.4" fill="#fff"/>
    <path d="M10.7 9.3h2.3v1.2h.1c.3-.6 1.2-1.5 2.6-1.5 2.8 0 3.3 1.8 3.3 4.2v4.5h-2.4v-4c0-1-.1-2.2-1.4-2.2-1.4 0-1.6 1.1-1.6 2.2v4h-2.4V9.3z" fill="#fff"/>
  </svg>`,

  eve: html`<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H17.5A2.5 2.5 0 0 1 20 6.5V13a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3v-3H6.5A2.5 2.5 0 0 1 4 13V6.5z" fill="#34C759"/>
    <circle cx="9" cy="9.5" r="1" fill="#fff"/>
    <circle cx="12" cy="9.5" r="1" fill="#fff"/>
    <circle cx="15" cy="9.5" r="1" fill="#fff"/>
  </svg>`,
};

export function renderPlatformIcon(name: string, size = 24) {
  const icon = platformIcons[name.toLowerCase()];
  if (icon) {
    return html`<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">${icon}</div>`;
  }
  // Fallback: colored circle with first letter.
  const colors = ["#EA4335", "#4285F4", "#0F9D58", "#F4B400", "#E01E5A", "#635BFF", "#00A1E0", "#FF7A59"];
  const color = colors[name.length % colors.length];
  return html`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:${Math.round(size * 0.45)}px;font-weight:700;">${name.charAt(0).toUpperCase()}</div>`;
}

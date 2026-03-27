# Nexus Operator Console — V2 Style Guide

This is the canonical style reference for the v2 operator console UI. All components, pages, and future additions MUST follow these patterns exactly. When in doubt, reference the design images in `reference-design/`.

## Design Philosophy

- **Clean, modern SaaS** — not a power-user terminal, not a dashboard overload
- **Dark-first** with light mode support via CSS custom properties
- **Warm neutral palette** — not cold blue/gray, slightly warm blacks and tans
- **Gold accent** (`#D4A843`) for primary CTAs and active states only
- **Minimal borders** — use background contrast and spacing over heavy borders
- **Generous whitespace** — let content breathe

## Typography

| Token | Size | Usage |
|-------|------|-------|
| `--v2-text-2xs` | 10px | Badges, tiny labels |
| `--v2-text-xs` | 11px | Table cells, secondary text, button labels |
| `--v2-text-sm` | 13px | Body text, descriptions, inputs |
| `--v2-text-base` | 14px | Primary body text |
| `--v2-text-md` | 15px | Sub-headings within cards |
| `--v2-text-lg` | 17px | Section titles |
| `--v2-text-xl` | 20px | Page titles (settings sub-pages) |
| `--v2-text-2xl` | 24px | Main page titles |

- **Font**: `Inter` (primary), system stack fallback
- **Mono**: `JetBrains Mono` for IDs, code, technical values
- **Weights**: 400 (normal), 500 (medium — buttons, labels), 600 (semibold — headings), 700 (bold — page titles)

## Color System

### Backgrounds (dark mode)
| Token | Value | Usage |
|-------|-------|-------|
| `--v2-bg` | `#0A0A0A` | Page background |
| `--v2-bg-raised` | `#0F0F0F` | Slightly raised surfaces |
| `--v2-bg-card` | `#161616` | Cards, panels |
| `--v2-bg-card-hover` | `#1C1C1C` | Card hover state |
| `--v2-bg-input` | `#161616` | Input fields |
| `--v2-bg-nav-pill` | `rgba(255,255,255,0.07)` | Inactive nav pills |
| `--v2-bg-nav-pill-active` | `rgba(255,255,255,0.11)` | Active nav pill |

### Text (dark mode)
| Token | Value | Usage |
|-------|-------|-------|
| `--v2-text` | `#E8E8E8` | Primary text |
| `--v2-text-strong` | `#FFFFFF` | Headings, emphasis |
| `--v2-text-muted` | `#7A7A7A` | Secondary/helper text |
| `--v2-text-faint` | `#4A4A4A` | Disabled, tertiary |

### Borders (dark mode)
| Token | Value | Usage |
|-------|-------|-------|
| `--v2-border` | `#1E1E1E` | Subtle dividers |
| `--v2-border-strong` | `#2E2E2E` | Card borders, input borders |
| `--v2-border-input` | `#2A2A2A` | Input field borders |

### Accent
| Token | Value | Usage |
|-------|-------|-------|
| `--v2-gold` | `#D4A843` | Primary CTA background, active indicators |
| `--v2-gold-hover` | `#E5B94E` | Primary CTA hover |
| `--v2-gold-text` | `#1A1A1A` | Text on gold background |

### Semantic
| Token | Value | Usage |
|-------|-------|-------|
| `--v2-success` | `#22C55E` | Connected, active, passed |
| `--v2-warning` | `#F59E0B` | Attention needed |
| `--v2-danger` | `#EF4444` | Error, failed, destructive |
| `--v2-info` | `#3B82F6` | Informational, in-progress |

## Component Patterns

### Buttons

Three button styles. All are pill-shaped (`border-radius: 9999px`), 32px height, 13px font.

| Class | Appearance | When to use |
|-------|-----------|-------------|
| `.v2-btn.v2-btn--primary` | Gold bg, dark text | Primary action per section (Create, Save, Connect) |
| `.v2-btn.v2-btn--secondary` | Transparent, border, light text | Secondary actions (Cancel, Back, Edit) |
| `.v2-btn.v2-btn--ghost` | No border, no bg, muted text | Tertiary actions, inline links |

**Rules:**
- Only ONE gold primary button per visible section
- Buttons always have hover states (darken/lighten)
- Use `gap: 5px` for icon + label buttons
- Small variant: add `.v2-btn--sm` for 26px height buttons

### Sub-Tabs (Page-level navigation within a tab)

Sub-tabs appear below the page title. They look like **text links with an underline indicator**, NOT bordered buttons.

| Class | State | Appearance |
|-------|-------|-----------|
| `.v2-detail-tab` | Default | Muted text, no background, no border |
| `.v2-detail-tab.v2-detail-tab--active` | Active | Strong text color, gold underline indicator (2px bottom border) |

**Rules:**
- Sub-tabs are plain text — no background fill, no border
- Active tab gets a 2px gold bottom border and stronger text color
- Hover shows slight text color brightening
- Container uses `display: flex; gap: 24px` with a bottom border
- Sub-tabs sit in a `.v2-detail-tabs` container

### Cards

| Class | Appearance | Usage |
|-------|-----------|-------|
| `.v2-card` | Rounded corners, subtle bg, border | Content containers |
| `.v2-card.v2-card--interactive` | + hover effect | Clickable cards (agents, search results) |

**Rules:**
- Border radius: `--v2-radius-lg` (10px)
- Background: `--v2-bg-card`
- Border: 1px solid `--v2-border`
- Padding: `--v2-space-4` (16px) default
- Interactive cards: hover raises `--v2-bg-card-hover` + subtle shadow

### Tables

Use `.v2-table` class. Tables should be clean and minimal:
- No alternating row colors
- Subtle bottom border between rows
- Header row: uppercase label text, `--v2-text-xs`, `--v2-text-muted`
- Cell text: `--v2-text-xs`
- Mono values (IDs, timestamps): `font-family: var(--v2-font-mono)`
- Hover: subtle row background change

### Badges / Status Pills

| Class | Color | Usage |
|-------|-------|-------|
| `.v2-badge.v2-badge--success` | Green bg muted, green text | Connected, active, passed |
| `.v2-badge.v2-badge--warning` | Yellow bg muted, yellow text | Warning, attention |
| `.v2-badge.v2-badge--danger` | Red bg muted, red text | Error, failed, destructive |
| `.v2-badge.v2-badge--neutral` | Gray bg, gray text | Inactive, pending, default |
| `.v2-badge.v2-badge--info` | Blue bg muted, blue text | In-progress, informational |

**Rules:**
- Pill-shaped (`border-radius: 9999px`)
- Small: 10px font, 4px 8px padding
- Use semantic colors from token system
- NEVER use raw color values inline

### Inputs

| Element | Style |
|---------|-------|
| Text inputs | `--v2-bg-input` bg, `--v2-border-input` border, `--v2-radius-md` corners, 36px height |
| Selects | Same as text inputs, dark bg dropdown |
| Textareas | Same base style, min-height varies |
| Search | Wrapped in `.v2-search-wrap` with SVG search icon |

**Rules:**
- All inputs have focus ring: `box-shadow: 0 0 0 2px var(--v2-gold)` with `border-color: var(--v2-gold)`
- Required fields: add red asterisk via `.v2-required::after { content: " *"; color: var(--v2-danger); }`
- Placeholder text: `--v2-text-faint`

### Modals

- Centered overlay on dimmed backdrop (`--v2-bg-overlay`)
- Modal body: `--v2-bg-card` or slightly lighter
- Border radius: `--v2-radius-xl` (14px)
- Max-width: 480px default, `.v2-modal--lg` for 640px
- Header: Title (semibold, xl) + subtitle (muted, sm) + close button
- Footer: Cancel (secondary) on left, primary action (gold) on right
- Backdrop click dismisses

### Empty States

Centered within their container:
- Icon (48px, muted color)
- Title (semibold)
- Description (muted, sm)
- Optional CTA button below

Use `.v2-empty`, `.v2-empty-icon`, `.v2-empty-title`, `.v2-empty-description`.

### Filter Pills / Segments

For filtering (like queue state filters): use `.v2-filter-pill` buttons.
- Background: transparent
- Active: `--v2-bg-nav-pill-active`, strong text
- Hover: `--v2-bg-nav-pill`
- Pill-shaped, 28px height, 11px font

### Toasts

- Fixed bottom-right corner
- Dark bg (`#111`), light text
- "Got it" dismiss button
- Auto-dismiss after 5 seconds
- Slide-in animation from right

## Layout Rules

### Page Structure
```
<div class="v2-page">
  <!-- Sub-tabs (if any) -->
  <div class="v2-detail-tabs">...</div>

  <!-- Page header -->
  <h1 class="v2-page-title">Page Name</h1>
  <p class="v2-page-subtitle">Description.</p>

  <!-- Content -->
  ...
</div>
```

### Grid
- Use CSS grid or flexbox inline (no utility grid classes beyond `v2-grid-2`, `v2-grid-3`)
- Stat card grids: `display: grid; grid-template-columns: repeat(N, 1fr); gap: 12px`
- Form grids: `v2-grid-2` for 2-column form layouts

### Spacing
- Section spacing: `--v2-space-5` (20px) or `--v2-space-6` (24px)
- Card internal padding: `--v2-space-4` (16px)
- Tight spacing (between related items): `--v2-space-2` (8px)
- Section labels: `margin-bottom: --v2-space-3` (12px)

## Icon System

All icons use Lucide-style SVG with:
- `stroke: currentColor`
- `fill: none`
- `stroke-width: 2`
- `stroke-linecap: round`
- `stroke-linejoin: round`
- Default size: 16px (nav), 14px (buttons), 48px (empty states)

Import from `../../ui/icons.ts`.

## What NOT to Do

- **No native `<select>` styling** — use custom dropdowns or styled selects
- **No browser default focus rings** — always use custom `box-shadow` focus
- **No hard-coded colors** — always use CSS custom properties
- **No pixel font sizes** — use the token scale
- **No heavy borders** — prefer subtle 1px borders with low-contrast colors
- **No background fills on sub-tabs** — sub-tabs are text with underline, not pills
- **No more than one gold CTA per visible section**
- **No alternating row colors in tables**

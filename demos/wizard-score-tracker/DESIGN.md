---
name: Wizard Score Tracker
description: Arcane-ledger system. Ink-black app chrome, one restrained gold accent, a warm parchment "block" surface for the actual scoring grid. Personality lives in the wordmark and two celebratory moments, not in every button.
colors:
  bg: "oklch(16% 0.02 275)"
  bg-elevated: "oklch(20% 0.022 275)"
  surface: "oklch(24% 0.02 275)"
  surface-hover: "oklch(28% 0.02 275)"
  border: "oklch(40% 0.02 275 / 35%)"
  border-strong: "oklch(50% 0.02 275 / 55%)"

  paper: "oklch(93% 0.015 85)"
  paper-ink: "oklch(18% 0.012 85)"
  paper-line: "oklch(18% 0.012 85 / 16%)"
  paper-muted: "oklch(18% 0.012 85 / 55%)"

  text: "oklch(94% 0.008 275)"
  text-muted: "oklch(74% 0.02 275)"
  text-faint: "oklch(60% 0.02 275)"

  gold: "oklch(78% 0.13 85)"
  gold-strong: "oklch(85% 0.15 88)"
  gold-wash: "oklch(78% 0.13 85 / 12%)"
  gold-border: "oklch(78% 0.13 85 / 38%)"

  green: "oklch(72% 0.17 148)"
  red: "oklch(66% 0.19 25)"
  paper-green: "oklch(45% 0.14 148)"
  paper-red: "oklch(48% 0.18 25)"

  trump-red: "oklch(60% 0.19 25)"
  trump-green: "oklch(62% 0.15 148)"
  trump-blue: "oklch(58% 0.16 255)"
  trump-yellow: "oklch(80% 0.15 95)"
  trump-none: "oklch(45% 0.01 275)"

  shadow-color: "oklch(5% 0.01 275 / 48%)"
  overlay: "oklch(8% 0.01 275 / 75%)"
  bg-vignette: "oklch(10% 0.015 275 / 70%)"
  paper-tint: "oklch(96% 0.01 85)"
  paper-tint-soft: "oklch(96% 0.01 85 / 60%)"
  paper-tint-hover: "oklch(90% 0.02 85)"
  paper-ink-hover: "oklch(24% 0.02 85)"
  paper-border: "oklch(18% 0.012 85 / 25%)"
  red-strong: "oklch(80% 0.12 25)"
  red-ink: "oklch(12% 0.01 25)"
typography:
  wordmark:
    fontFamily: "Cinzel, serif"
    fontSize: "2.75rem"
    fontWeight: 900
    letterSpacing: "0.05em"
  celebratory:
    fontFamily: "Cinzel, serif"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "0.02em"
  heading:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  xs: "3px"
  sm: "6px"
  md: "10px"
  lg: "18px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "32px"
---

## Why two typefaces

Product UI usually wants one family (`skill/reference/product.md`). This app is the exception the register explicitly allows: a themed hobby tool where the wordmark and celebratory moments (winner banner, block imprint) earn a display face. Every functional surface — buttons, labels, table cells, chart axes, the round-entry numpad — stays in Inter, including tabular figures for score alignment. Cinzel appears in exactly three places: `.menu-wordmark`, `.winner-name`, `.block-imprint-mark`.

## Why Inter specifically

Inter is flagged as an overused face in brand contexts (`overused-font` in the shared design laws), but `reference/product.md` explicitly permits "system fonts and familiar sans defaults (Inter, SF Pro, system-ui stacks)" for product register — this is a scoring tool used mid-game, not a marketing surface competing for distinctiveness. Familiarity here is a feature: a player glancing at the screen for two seconds should never have to parse an unfamiliar letterform.

## The paper/ink duality

The score grid (`.block-outer` and children) uses a light parchment surface (`--paper` / `--paper-ink`) deliberately distinct from the dark app chrome (`--bg` / `--surface`). This isn't decoration — it mirrors the physical "Wizard block" scoring pad the app replaces, and gives the one part of the UI that demands sustained reading (the grid) the higher-contrast light-on-dark-ink treatment while the surrounding chrome stays low-key.

## Trump suits carry shape, not just color

Each suit in `TRUMP_SUITS` pairs a color with a glyph (`●` red, `▲` green, `■` blue, `◆` yellow, `—` none) rendered through the shared `TrumpSwatch` component, so colorblind players aren't relying on hue alone to read the trump column, picker, or round-modal selector.

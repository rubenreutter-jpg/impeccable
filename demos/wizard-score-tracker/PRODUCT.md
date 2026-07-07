# Wizard Score Tracker

## Register

product

## Users

Groups of 3-6 people playing the card game "Wizard" together at a table — living room, bar, game night. One person (the "scorekeeper") holds the phone and enters bids and tricks for every player, every round, often one-handed, between hands of cards, sometimes after a beer. The app is looked at in short bursts (seconds per round), not read continuously.

## Product Purpose

Replace the paper scoring block players traditionally use for Wizard. The job is fast, error-free numeric entry and an always-correct running total — not a showcase. Everything else (stats, achievements, profiles) is a secondary reward layer for people who play regularly.

## Brand Personality

The game is a fantasy-themed trick-taking game (wizards, tricks, trump suits), so the interface is allowed a themed identity — but it is a tool used mid-game, not a menu screen someone lingers on. Personality lives in the wordmark, the "printed scoring block" metaphor for the grid, and rare celebratory moments (game end, achievement unlock). It does not live in every button, label, or data cell.

## Anti-references

- The original build treated every piece of UI chrome — buttons, field labels, table headers, tiny meta text — in a display fantasy serif (Cinzel) at heavy letter-spacing, with an animated molten-lava crack background running behind the scoring grid at all times. Legible-at-a-glance data entry is the core job; decoration was competing with it, not supporting it.
- Text set at 0.5-0.65rem throughout (labels, cell values, chart axes) reading as illegibly small on a phone.
- Color-only trump indicators with no shape/label backup.

## Design Principles

1. **The tool disappears into the task.** A player mid-game should be able to enter a bid in under two seconds without hunting for the right cell or squinting at a label.
2. **One UI typeface, one display moment.** Inter carries every label, button, and data cell. Cinzel is reserved for the wordmark and the two or three moments that are genuinely celebratory (winner banner, achievement unlock).
3. **The scoring block is the real affordance, not decoration.** It mimics the paper "Wizard block" players already know, so keep the ledger structure, but make every cell legible and every tap target big enough for a thumb.
4. **Motion communicates state.** Round modal open/close, a correct/wrong flash, an achievement unlocking — yes. Ambient background animation competing with the grid — no.

## Accessibility & Inclusion

WCAG 2.2 AA contrast for all text, including chart labels and secondary meta text. Trump suits carry a shape/label in addition to color. Tap targets ≥44px for all round-entry controls (numpad, trump swatches, table cells). Honor `prefers-reduced-motion`.

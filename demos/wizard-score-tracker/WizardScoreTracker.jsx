import React, { useState, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ROUNDS = 20;
const maxRoundsForPlayers = (n) => Math.floor(60 / n);

// Each suit carries a color AND a shape glyph, so trump is never color-only.
// `ink` picks whichever glyph color (dark ink vs. light paper) clears 3:1
// against that swatch's background — verified against the palette below.
const TRUMP_SUITS = [
  { key: "red",    glyph: "●", name: "Rot",     ink: false },
  { key: "green",  glyph: "▲", name: "Grün",    ink: true  },
  { key: "blue",   glyph: "■", name: "Blau",    ink: false },
  { key: "yellow", glyph: "◆", name: "Gelb",    ink: true  },
  { key: "none",   glyph: "—", name: "Farblos", ink: false },
];
const TRUMP_BY_KEY = Object.fromEntries(TRUMP_SUITS.map(s => [s.key, s]));

const PLAYER_COLORS = ["#6fd3ff", "#5fd487", "#e8c25a", "#ff9166", "#c792ff", "#ff7aa8"];

// ─── Achievements ─────────────────────────────────────────────────────────────

const ACHIEVEMENTS = [
  { id: "first_win",    icon: "🏆", label: "Erster Sieg",      desc: "Gewinne dein erstes Spiel",                 check: (p) => p.wins >= 1 },
  { id: "hattrick",     icon: "🎩", label: "Hattrick",         desc: "Gewinne 3 Spiele",                          check: (p) => p.wins >= 3 },
  { id: "legend",       icon: "⚡", label: "Legende",          desc: "Gewinne 10 Spiele",                         check: (p) => p.wins >= 10 },
  { id: "sharpshooter", icon: "🎯", label: "Scharfschütze",    desc: "80%+ Trefferquote in einem Spiel",          check: (p) => p.bestRate >= 80 },
  { id: "perfect",      icon: "✨", label: "Perfektionist",    desc: "100% Trefferquote in einem Spiel",          check: (p) => p.bestRate >= 100 },
  { id: "veteran",      icon: "⚔️", label: "Veteran",          desc: "Spiele 20 Spiele",                          check: (p) => p.gamesPlayed >= 20 },
  { id: "highscore",    icon: "🌟", label: "Highscore",        desc: "Erreiche 50+ Punkte in einem Spiel",        check: (p) => p.bestScore >= 50 },
  { id: "comeback",     icon: "🔥", label: "Comeback-König",   desc: "Spiele 5 Spiele",                           check: (p) => p.gamesPlayed >= 5 },
];

function computeAchievements(profile) {
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(profile) }));
}

// ─── Score ────────────────────────────────────────────────────────────────────

function calcPoints(announced, tricks) {
  if (announced === "" || tricks === "") return null;
  const a = parseInt(announced, 10);
  const t = parseInt(tricks, 10);
  if (isNaN(a) || isNaN(t)) return null;
  if (a === t) return 2 + t;
  return -1 * Math.abs(a - t);
}

function calcTotals(game) {
  const totals = {};
  for (let p = 0; p < game.playerCount; p++) {
    let sum = 0;
    const byRound = {};
    for (let r = 1; r <= MAX_ROUNDS; r++) {
      const cell = game.grid[r]?.[p];
      const pts = cell ? calcPoints(cell.announced, cell.tricks) : null;
      byRound[r] = pts;
      if (pts !== null) sum += pts;
    }
    totals[p] = { sum, byRound };
  }
  return totals;
}

function calcStats(game) {
  const maxR = maxRoundsForPlayers(game.playerCount);
  return game.players.map((name, p) => {
    let correct = 0, total = 0, running = 0;
    const roundPoints = [0];
    for (let r = 1; r <= maxR; r++) {
      const cell = game.grid[r]?.[p];
      const pts = cell ? calcPoints(cell.announced, cell.tricks) : null;
      if (pts !== null) {
        total++;
        if (parseInt(cell.announced, 10) === parseInt(cell.tricks, 10)) correct++;
        running += pts;
      }
      roundPoints.push(running);
    }
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { name, correct, total, rate, roundPoints };
  });
}

function calcTrumpFrequency(game) {
  const maxR = maxRoundsForPlayers(game.playerCount);
  const freq = {};
  TRUMP_SUITS.forEach(s => { freq[s.key] = 0; });
  for (let r = 1; r <= maxR; r++) {
    const t = game.trump?.[r];
    if (t) freq[t] = (freq[t] || 0) + 1;
  }
  return freq;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveGames(games) { localStorage.setItem("wizard_games", JSON.stringify(games)); }
function loadGames() { try { return JSON.parse(localStorage.getItem("wizard_games") || "[]"); } catch { return []; } }
function saveProfiles(profiles) { localStorage.setItem("wizard_profiles", JSON.stringify(profiles)); }
function loadProfiles() { try { return JSON.parse(localStorage.getItem("wizard_profiles") || "[]"); } catch { return []; } }

function createEmptyProfile(name) {
  return { id: Date.now().toString() + Math.random(), name, gamesPlayed: 0, wins: 0, totalPoints: 0, bestScore: 0, bestRate: 0, avgRate: 0, createdAt: new Date().toISOString() };
}

function createEmptyGame({ name, players, playerCount, profileIds }) {
  const grid = {}, firstPlayer = {}, trump = {};
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    grid[r] = {};
    firstPlayer[r] = r % playerCount; // Dealer = (firstPlayer-1+n)%n → round 1 dealer=0=Spieler1, announcer=1=Spieler2
    trump[r] = null;
    for (let p = 0; p < playerCount; p++) grid[r][p] = { announced: "", tricks: "" };
  }
  return { id: Date.now().toString(), name, players, playerCount, profileIds: profileIds || players.map(() => null), grid, firstPlayer, trump, currentRound: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function applyGameToProfiles(game, profiles) {
  const totals = calcTotals(game);
  const stats = calcStats(game);
  const scores = game.players.map((_, p) => totals[p].sum);
  const maxScore = Math.max(...scores);
  const updated = [...profiles];
  game.players.forEach((_, p) => {
    const pid = game.profileIds?.[p];
    if (!pid) return;
    const idx = updated.findIndex(pr => pr.id === pid);
    if (idx < 0) return;
    const pr = { ...updated[idx] };
    pr.gamesPlayed += 1;
    if (scores[p] === maxScore) pr.wins += 1;
    pr.totalPoints += scores[p];
    pr.bestScore = Math.max(pr.bestScore, scores[p]);
    pr.bestRate = Math.max(pr.bestRate, stats[p].rate);
    pr.avgRate = Math.round(((pr.avgRate * (pr.gamesPlayed - 1)) + stats[p].rate) / pr.gamesPlayed);
    updated[idx] = pr;
  });
  return updated;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
// Design system: one UI typeface (Inter) carries every label, button, and data
// cell. Cinzel is reserved for the wordmark and the two celebratory moments
// (winner banner, block imprint) — see PRODUCT.md "Design Principles".

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Cinzel:wght@600;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: oklch(16% 0.02 275);
    --bg-elevated: oklch(20% 0.022 275);
    --surface: oklch(24% 0.02 275);
    --surface-hover: oklch(28% 0.02 275);
    --border: oklch(40% 0.02 275 / 35%);
    --border-strong: oklch(50% 0.02 275 / 55%);

    --paper: oklch(93% 0.015 85);
    --paper-ink: oklch(18% 0.012 85);
    --paper-line: oklch(18% 0.012 85 / 16%);
    --paper-muted: oklch(18% 0.012 85 / 55%);

    --text: oklch(94% 0.008 275);
    --text-muted: oklch(74% 0.02 275);
    --text-faint: oklch(60% 0.02 275);

    --gold: oklch(78% 0.13 85);
    --gold-strong: oklch(85% 0.15 88);
    --gold-wash: oklch(78% 0.13 85 / 12%);
    --gold-border: oklch(78% 0.13 85 / 38%);

    --green: oklch(72% 0.17 148);
    --red: oklch(66% 0.19 25);
    --paper-green: oklch(45% 0.14 148);
    --paper-red: oklch(48% 0.18 25);

    --trump-red: oklch(60% 0.19 25);
    --trump-green: oklch(62% 0.15 148);
    --trump-blue: oklch(58% 0.16 255);
    --trump-yellow: oklch(80% 0.15 95);
    --trump-none: oklch(45% 0.01 275);

    --shadow-color: oklch(5% 0.01 275 / 48%);
    --overlay: oklch(8% 0.01 275 / 75%);
    --bg-vignette: oklch(10% 0.015 275 / 70%);
    --paper-tint: oklch(96% 0.01 85);
    --paper-tint-soft: oklch(96% 0.01 85 / 60%);
    --paper-tint-hover: oklch(90% 0.02 85);
    --paper-ink-hover: oklch(24% 0.02 85);
    --paper-border: oklch(18% 0.012 85 / 25%);
    --red-strong: oklch(80% 0.12 25);
    --red-ink: oklch(12% 0.01 25);

    --font-ui: 'Inter', system-ui, -apple-system, sans-serif;
    --font-display: 'Cinzel', serif;

    --radius-xs: 3px;
    --radius-sm: 6px;
    --radius: 10px;
    --radius-lg: 18px;

    --z-sticky: 10;
    --z-modal-backdrop: 100;
    --z-modal: 101;
    --z-popover: 200;
    --z-toast: 300;

    --cell-w: 74px; --cell-h: 52px; --row-label-w: 40px; --trump-col-w: 40px;
  }

  html, body, #root { min-height: 100vh; background: var(--bg); font-family: var(--font-ui); color: var(--text); overflow-x: hidden; -webkit-font-smoothing: antialiased; }
  body { font-variant-numeric: tabular-nums; }
  button, input, select { font-family: inherit; }
  button { touch-action: manipulation; }

  button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible {
    outline: 2px solid var(--gold-strong); outline-offset: 2px; border-radius: var(--radius-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  }

  /* ── ARCANE BACKGROUND ── */
  /* Static ink ground + one slow, low-contrast ambient glow. No motion competes with data entry. */
  @keyframes ambientBreathe { 0%, 100% { opacity: 0.65; } 50% { opacity: 1; } }
  .arcane-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; background: var(--bg); }
  .arcane-bg__glow {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 70% 45% at 50% -8%, oklch(78% 0.13 85 / 14%) 0%, transparent 60%),
      radial-gradient(ellipse 55% 40% at 8% 105%, oklch(58% 0.16 255 / 10%) 0%, transparent 65%),
      radial-gradient(ellipse 55% 40% at 95% 100%, oklch(60% 0.19 25 / 8%) 0%, transparent 65%);
    animation: ambientBreathe 10s ease-in-out infinite;
  }
  .arcane-bg__stars { position: absolute; inset: 0; opacity: 0.5; }
  .arcane-bg__vignette { position: absolute; inset: 0; background: radial-gradient(ellipse 100% 80% at 50% 40%, transparent 45%, var(--bg-vignette) 100%); }

  /* ── BUTTONS (single vocabulary) ── */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    font-family: var(--font-ui); font-size: 0.875rem; font-weight: 600; letter-spacing: 0.01em;
    padding: 0 18px; height: 44px; border-radius: var(--radius); cursor: pointer;
    border: 1px solid transparent; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 100ms ease;
    -webkit-tap-highlight-color: transparent; white-space: nowrap;
  }
  .btn:active { transform: scale(0.97); }
  .btn-block { display: flex; width: 100%; }
  .btn-primary { background: var(--gold); border-color: var(--gold); color: oklch(18% 0.02 85); }
  .btn-primary:hover { background: var(--gold-strong); border-color: var(--gold-strong); }
  .btn-secondary { background: transparent; border-color: var(--border-strong); color: var(--text); }
  .btn-secondary:hover { background: var(--surface-hover); border-color: var(--gold-border); }
  .btn-danger { background: transparent; border-color: oklch(66% 0.19 25 / 55%); color: var(--red-strong); }
  .btn-danger:hover { background: oklch(60% 0.19 25 / 12%); }
  .btn-danger-solid { background: var(--red); border-color: var(--red); color: var(--red-ink); }
  .btn-danger-solid:hover { filter: brightness(1.08); }
  .btn-sm { height: 36px; padding: 0 14px; font-size: 0.8125rem; }
  .btn-icon { width: 40px; height: 40px; padding: 0; flex-shrink: 0; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

  /* ── MENU ── */
  .menu-screen { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 48px 20px 48px; position: relative; z-index: 1; }
  .menu-emblem { margin-bottom: 20px; }
  .menu-wordmark { font-family: var(--font-display); font-size: 2.75rem; font-weight: 900; color: var(--gold-strong); letter-spacing: 0.05em; text-align: center; margin-bottom: 6px; }
  .menu-tagline { font-family: var(--font-ui); font-size: 0.8125rem; color: var(--text-faint); letter-spacing: 0.08em; text-transform: uppercase; text-align: center; margin-bottom: 36px; }
  .menu-actions { width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 10px; }
  .saved-list { width: 100%; max-width: 360px; margin: 28px auto 0; }
  .saved-list-title { font-size: 0.75rem; letter-spacing: 0.08em; color: var(--text-faint); text-transform: uppercase; margin-bottom: 12px; font-weight: 600; }
  .saved-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px; margin-bottom: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease; }
  .saved-item:hover { background: var(--surface-hover); border-color: var(--border-strong); }
  .saved-item-name { font-size: 0.9375rem; color: var(--text); font-weight: 600; margin-bottom: 3px; }
  .saved-item-date { font-size: 0.75rem; color: var(--gold); margin-bottom: 3px; font-weight: 500; }
  .saved-item-meta { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px; }
  .saved-item-players { font-size: 0.75rem; color: var(--text-faint); }
  .empty-state { text-align: center; color: var(--text-faint); font-size: 0.8125rem; padding: 20px 0; }

  /* ── WIZARD SYMBOLS (menu-only flourish) ── */
  @keyframes symFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  .wizard-emblem { animation: symFloat 5s ease-in-out infinite; }

  /* ── MODAL ── */
  .modal-overlay { position: fixed; inset: 0; background: var(--overlay); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal-backdrop); padding: 16px; overflow-y: auto; }
  .modal { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px 20px; width: 100%; max-width: 420px; box-shadow: 0 24px 64px var(--shadow-color); max-height: 90vh; overflow-y: auto; z-index: var(--z-modal); }
  .modal-title { font-size: 1.0625rem; font-weight: 700; color: var(--text); margin-bottom: 18px; letter-spacing: -0.01em; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; color: var(--text-faint); margin-bottom: 6px; text-transform: uppercase; }
  .field input, .field select, .text-input { width: 100%; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 0.9375rem; }
  .field input:focus, .field select:focus, .text-input:focus { outline: none; border-color: var(--gold-border); }
  .field select option { background: var(--bg-elevated); color: var(--text); }
  .modal-actions { display: flex; gap: 10px; margin-top: 20px; }
  .modal-actions .btn { flex: 1; }

  .player-count-grid { display: flex; gap: 8px; }
  .player-count-btn { flex: 1; height: 52px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.9375rem; font-weight: 700; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; transition: background-color 150ms, border-color 150ms, color 150ms; }
  .player-count-btn span { font-size: 0.625rem; font-weight: 500; opacity: 0.75; }
  .player-count-btn.active { background: var(--gold-wash); border-color: var(--gold-border); color: var(--gold-strong); }

  .player-slot { border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); padding: 10px 12px; }
  .player-slot.has-profile { border-color: var(--gold-border); background: var(--gold-wash); }
  .player-slot-row { display: flex; align-items: center; gap: 8px; }
  .player-slot-index { font-size: 0.75rem; color: var(--text-faint); flex-shrink: 0; width: 16px; }
  .player-slot-name { font-size: 0.9375rem; color: var(--gold-strong); font-weight: 700; flex: 1; }
  .player-slot-clear { background: none; border: none; color: var(--text-faint); cursor: pointer; font-size: 0.9375rem; padding: 4px; width: 28px; height: 28px; border-radius: var(--radius-sm); }
  .player-slot-clear:hover { color: var(--text); background: var(--surface-hover); }
  .player-slot-stats { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
  .player-slot-stat { font-size: 0.75rem; color: var(--text-muted); }
  .player-slot-stat strong { color: var(--text); font-weight: 600; }
  .player-slot-picker-label { font-size: 0.6875rem; color: var(--text-faint); width: 100%; margin-bottom: 4px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .profile-pill { padding: 6px 12px; border-radius: 999px; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--gold); font-size: 0.8125rem; font-weight: 600; transition: background-color 150ms, border-color 150ms; }
  .profile-pill:hover { background: var(--gold-wash); border-color: var(--gold-border); }

  /* ── GAME HEADER ── */
  .game-screen, .stats-screen, .profiles-screen { min-height: 100vh; display: flex; flex-direction: column; position: relative; z-index: 1; }
  .game-header { display: flex; align-items: center; gap: 6px; height: 56px; padding: 0 12px; background: var(--bg-elevated); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: var(--z-sticky); }
  .game-header-title { font-size: 0.9375rem; color: var(--text); font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .round-info { display: flex; align-items: center; gap: 14px; padding: 8px 14px; background: var(--bg); border-bottom: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted); }
  .round-info-item strong { color: var(--gold); font-weight: 700; }

  /* ── BLOCK ── */
  .block-wrapper { flex: 1; overflow-x: auto; overflow-y: auto; padding: 16px 12px 32px; -webkit-overflow-scrolling: touch; }
  .block-outer { display: inline-block; position: relative; background: var(--paper); border: 1px solid var(--paper-border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 12px 32px var(--shadow-color); }
  .block-header-row { display: flex; }
  .block-corner { width: var(--row-label-w); flex-shrink: 0; background: var(--paper-ink); }
  .block-trump-corner { width: var(--trump-col-w); flex-shrink: 0; background: var(--paper-ink); display: flex; align-items: center; justify-content: center; font-size: 0.625rem; font-weight: 600; color: oklch(94% 0.008 275 / 45%); letter-spacing: 0.05em; writing-mode: vertical-rl; padding: 4px 0; }
  .block-player-header { width: var(--cell-w); flex-shrink: 0; height: 46px; display: flex; align-items: center; justify-content: center; background: var(--paper-ink); color: var(--paper); font-size: 0.8125rem; font-weight: 700; border-left: 1px solid oklch(94% 0.008 275 / 12%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
  .block-player-header.is-winner { color: var(--gold-strong); }

  .block-row { display: flex; }
  .block-row-label { width: var(--row-label-w); flex-shrink: 0; height: var(--cell-h); display: flex; align-items: center; justify-content: center; background: var(--paper-ink); color: var(--paper); font-size: 0.8125rem; font-weight: 700; border-top: 1px solid oklch(94% 0.008 275 / 10%); cursor: pointer; user-select: none; }
  .block-row-label:hover { background: var(--paper-ink-hover); }
  .block-row-label.is-current { background: var(--trump-blue); color: white; }
  .block-cell { width: var(--cell-w); flex-shrink: 0; height: var(--cell-h); border-left: 1px solid var(--paper-line); border-top: 1px solid var(--paper-line); position: relative; background: var(--paper); }
  .block-cell.is-inactive { background: var(--paper-ink); }
  .block-cell.is-correct { background: oklch(45% 0.14 148 / 12%); }
  .block-cell.is-wrong { background: oklch(48% 0.18 25 / 10%); }
  .block-cell.is-current-round { background: oklch(58% 0.16 255 / 10%); }
  .cell-inner { display: flex; flex-direction: column; height: 100%; padding: 2px 3px; }
  .cell-row { display: flex; align-items: center; flex: 1; gap: 2px; }
  .cell-label { font-size: 0.625rem; font-weight: 600; color: var(--paper-muted); width: 13px; text-align: center; flex-shrink: 0; }
  .cell-input { flex: 1; border: none; background: transparent; font-family: var(--font-ui); font-size: 0.9375rem; font-weight: 600; color: var(--paper-ink); text-align: center; padding: 0; min-width: 0; -webkit-tap-highlight-color: transparent; }
  .cell-input:focus { outline: none; background: oklch(78% 0.13 85 / 16%); border-radius: var(--radius-xs); }
  .cell-divider { height: 1px; background: var(--paper-line); margin: 1px 3px; }
  .cell-pts { font-size: 0.6875rem; font-weight: 700; position: absolute; bottom: 2px; right: 4px; line-height: 1; }
  .cell-pts.is-pos { color: var(--paper-green); }
  .cell-pts.is-neg { color: var(--paper-red); }

  /* Trump column + swatch */
  .trump-cell { width: var(--trump-col-w); flex-shrink: 0; height: var(--cell-h); border-top: 1px solid var(--paper-border); border-left: 2px solid var(--paper-border); display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--paper-tint); -webkit-tap-highlight-color: transparent; }
  .trump-cell.is-inactive { background: var(--paper-ink); cursor: default; }
  .trump-cell:not(.is-inactive):hover { background: var(--paper-tint-hover); }
  .trump-empty { font-size: 0.75rem; color: oklch(18% 0.012 85 / 30%); font-weight: 700; }
  .suit-swatch { border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; flex-shrink: 0; -webkit-tap-highlight-color: transparent; }
  .suit-swatch--red    { background: var(--trump-red);    color: white; }
  .suit-swatch--green   { background: var(--trump-green);  color: var(--paper-ink); }
  .suit-swatch--blue    { background: var(--trump-blue);   color: white; }
  .suit-swatch--yellow  { background: var(--trump-yellow); color: var(--paper-ink); }
  .suit-swatch--none    { background: var(--trump-none);   color: white; border: 1px solid oklch(94% 0.008 275 / 25%); }
  .trump-picker { position: fixed; z-index: var(--z-popover); background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 10px; box-shadow: 0 16px 40px var(--shadow-color); display: flex; flex-wrap: wrap; gap: 6px; max-width: 230px; }
  .trump-picker-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; background: none; border: 2px solid transparent; border-radius: var(--radius-sm); padding: 6px; -webkit-tap-highlight-color: transparent; }
  .trump-picker-btn.active { border-color: var(--gold-strong); }
  .trump-picker-label { font-size: 0.6875rem; color: var(--text-muted); font-weight: 600; }
  .trump-picker-clear { width: 100%; font-size: 0.75rem; color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 8px 0 2px; text-align: center; font-weight: 600; }
  .trump-picker-clear:hover { color: var(--text); }

  /* Staircase + totals */
  .stair-label-row { display: flex; }
  .stair-label-cell { flex-shrink: 0; height: var(--cell-h); background: var(--paper-ink); display: flex; align-items: center; padding-left: 8px; }
  .stair-label-text { font-size: 0.6875rem; color: oklch(94% 0.008 275 / 55%); font-weight: 600; white-space: nowrap; }
  .cumulative-row { display: flex; }
  .cumulative-label { width: var(--row-label-w); flex-shrink: 0; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 0.625rem; color: oklch(94% 0.008 275 / 40%); border-top: 1px solid oklch(94% 0.008 275 / 8%); }
  .cumulative-cell { width: var(--cell-w); flex-shrink: 0; height: 22px; border-left: 1px solid var(--paper-line); border-top: 1px solid var(--paper-line); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; }
  .cumulative-cell.is-pos { color: var(--paper-green); }
  .cumulative-cell.is-neg { color: var(--paper-red); }
  .cumulative-trump { width: var(--trump-col-w); flex-shrink: 0; height: 22px; border-left: 2px solid oklch(18% 0.012 85 / 20%); }
  .totals-row { display: flex; border-top: 2px solid var(--paper-ink); }
  .totals-label { width: var(--row-label-w); flex-shrink: 0; height: 38px; background: var(--paper-ink); display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; color: var(--paper); font-weight: 700; }
  .totals-trump { width: var(--trump-col-w); flex-shrink: 0; height: 38px; background: var(--paper-ink); border-left: 2px solid oklch(94% 0.008 275 / 10%); }
  .totals-cell { width: var(--cell-w); flex-shrink: 0; height: 38px; border-left: 1px solid var(--paper-line); display: flex; align-items: center; justify-content: center; font-size: 0.9375rem; font-weight: 700; color: var(--paper-ink); }
  .totals-cell.is-winner { color: var(--gold); background: oklch(78% 0.13 85 / 10%); }
  .block-imprint { background: var(--paper-ink); display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; }
  .block-imprint-mark { font-family: var(--font-display); font-size: 0.8125rem; font-weight: 900; color: oklch(78% 0.13 85 / 55%); letter-spacing: 0.06em; }
  .block-imprint-title { font-size: 0.6875rem; color: oklch(94% 0.008 275 / 40%); letter-spacing: 0.03em; }

  /* ── STATS ── */
  .stats-body, .profiles-body { flex: 1; padding: 20px 16px 40px; overflow-y: auto; }
  .stats-title { font-size: 1.25rem; font-weight: 800; color: var(--text); letter-spacing: -0.01em; margin-bottom: 2px; }
  .stats-subtitle { font-size: 0.8125rem; color: var(--text-faint); margin-bottom: 22px; }
  .winner-banner { background: linear-gradient(135deg, var(--gold-wash), transparent); border: 1px solid var(--gold-border); border-radius: var(--radius-lg); padding: 18px; text-align: center; margin-bottom: 22px; }
  .winner-crown { font-size: 1.5rem; display: block; margin-bottom: 6px; }
  .winner-name { font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; color: var(--gold-strong); letter-spacing: 0.02em; }
  .winner-score { font-size: 0.8125rem; color: var(--text-muted); margin-top: 4px; }
  .stat-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; display: flex; align-items: center; gap: 12px; }
  .stat-card.is-winner { border-color: var(--gold-border); background: var(--gold-wash); }
  .stat-rank { font-size: 1.0625rem; font-weight: 800; color: var(--text-faint); width: 26px; flex-shrink: 0; text-align: center; }
  .stat-info { flex: 1; min-width: 0; }
  .stat-player-name { font-size: 0.9375rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat-row { display: flex; gap: 14px; margin-top: 4px; flex-wrap: wrap; }
  .stat-item { font-size: 0.75rem; color: var(--text-muted); }
  .stat-item strong { color: var(--text); font-weight: 600; }
  .stat-score { font-size: 1.0625rem; font-weight: 800; color: var(--gold-strong); flex-shrink: 0; }
  .hit-bar-wrap { margin-top: 6px; }
  .hit-bar-track { height: 5px; background: oklch(94% 0.008 275 / 10%); border-radius: var(--radius-xs); overflow: hidden; }
  .hit-bar-fill { height: 100%; width: 100%; border-radius: var(--radius-xs); background: var(--green); transform: scaleX(0); transform-origin: left; transition: transform 400ms ease-out; }
  .hit-bar-label { font-size: 0.6875rem; color: var(--text-faint); margin-top: 3px; }
  .chart-section, .pie-section { margin-bottom: 22px; }
  .chart-heading { font-size: 0.8125rem; font-weight: 600; color: var(--text-muted); margin-bottom: 10px; }
  .chart-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 10px 10px; }
  .chart-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 10px; padding: 0 4px; }
  .chart-legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-muted); }
  .chart-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .pie-wrap { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  .pie-legend { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 120px; }
  .pie-legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: var(--text-muted); }
  .pie-legend-count { margin-left: auto; font-size: 0.75rem; color: var(--gold); font-weight: 600; }
  .empty-note { color: var(--text-faint); font-size: 0.8125rem; text-align: center; padding: 16px 0; }

  /* ── PROFILES ── */
  .profile-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
  .profile-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: pointer; transition: background-color 150ms, border-color 150ms; }
  .profile-card:hover { background: var(--surface-hover); border-color: var(--border-strong); }
  .profile-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
  .profile-card-name { font-size: 0.9375rem; font-weight: 700; color: var(--text); }
  .profile-card-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
  .profile-stats-row { display: flex; gap: 14px; flex-wrap: wrap; }
  .profile-stat { font-size: 0.75rem; color: var(--text-muted); }
  .profile-stat strong { color: var(--text); font-weight: 600; }
  .achievements-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 14px; }
  .achievement { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); }
  .achievement.is-unlocked { border-color: var(--gold-border); background: var(--gold-wash); }
  .achievement.is-locked { opacity: 0.4; filter: grayscale(1); }
  .achievement-icon { font-size: 1.25rem; flex-shrink: 0; }
  .achievement-info { min-width: 0; }
  .achievement-label { font-size: 0.75rem; color: var(--gold-strong); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .achievement-desc { font-size: 0.6875rem; color: var(--text-faint); margin-top: 2px; line-height: 1.35; }
  .new-profile-row { display: flex; gap: 8px; }
  .new-profile-row .text-input { flex: 1; }

  /* ── CONFIRM / TOAST ── */
  .confirm-box { background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); padding: 24px; width: 100%; max-width: 340px; text-align: center; }
  .confirm-box p { font-size: 0.9375rem; color: var(--text); margin-bottom: 20px; line-height: 1.5; }
  .confirm-actions { display: flex; gap: 10px; justify-content: center; }
  .confirm-actions .btn { flex: 1; }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--bg-elevated); border: 1px solid var(--gold-border); color: var(--gold-strong); font-size: 0.8125rem; font-weight: 600; padding: 12px 22px; border-radius: var(--radius); box-shadow: 0 12px 32px var(--shadow-color); z-index: var(--z-toast); pointer-events: none; animation: fadeInUp 220ms ease-out; }
  @keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  /* ── ROUND MODAL (bottom sheet — deliberate for one-handed thumb reach mid-game) ── */
  .round-modal-overlay { align-items: flex-end; padding: 0; background: var(--overlay); }
  .round-modal { background: var(--bg-elevated); border-top: 1px solid var(--border-strong); border-radius: var(--radius-lg) var(--radius-lg) 0 0; width: 100%; max-width: 480px; margin: 0 auto; padding-bottom: env(safe-area-inset-bottom, 16px); max-height: 92vh; overflow-y: auto; }
  .round-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border); }
  .round-modal-title { font-size: 1rem; font-weight: 700; color: var(--text); }
  .round-modal-meta { display: flex; border-bottom: 1px solid var(--border); }
  .round-modal-meta-item { flex: 1; padding: 10px 16px; }
  .round-modal-meta-item + .round-modal-meta-item { border-left: 1px solid var(--border); }
  .round-modal-meta-label { font-size: 0.6875rem; color: var(--text-faint); font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: 3px; }
  .round-modal-meta-value { font-size: 0.875rem; color: var(--text); font-weight: 700; }
  .round-modal-meta-value.is-accent { color: var(--gold-strong); }
  .round-modal-players { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
  .round-modal-player { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: var(--radius-sm); border: 1px solid transparent; }
  .round-modal-player.is-active { background: var(--gold-wash); border-color: var(--gold-border); }
  .rmp-name { font-size: 0.875rem; color: var(--text); font-weight: 600; width: 84px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rmp-fields { display: flex; align-items: center; gap: 6px; flex: 1; }
  .rmp-field { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); cursor: pointer; min-width: 46px; min-height: 44px; justify-content: center; transition: border-color 150ms, background-color 150ms; }
  .rmp-field.is-active { border-color: var(--gold-strong); background: var(--gold-wash); }
  .rmp-field-label { font-size: 0.5625rem; color: var(--text-faint); font-weight: 600; letter-spacing: 0.03em; }
  .rmp-field-val { font-size: 0.9375rem; font-weight: 700; color: var(--text); }
  .rmp-pts { font-size: 0.8125rem; font-weight: 700; min-width: 36px; text-align: center; }
  .rmp-pts.is-pos { color: var(--green); }
  .rmp-pts.is-neg { color: var(--red); }
  .rmp-active-label { font-size: 0.75rem; color: var(--gold); font-weight: 600; text-align: center; padding: 8px 0 4px; }
  .rmp-actions { display: flex; gap: 10px; padding: 12px 16px 0; }
  .rmp-actions .btn { flex: 1; }

  .rmp-trump-row { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .rmp-trump-label { font-size: 0.75rem; color: var(--text-faint); font-weight: 600; flex-shrink: 0; }
  .rmp-trump-swatch { width: 32px; height: 32px; font-size: 0.875rem; border: 2px solid transparent; cursor: pointer; transition: border-color 150ms, transform 100ms; }
  .rmp-trump-swatch.active { border-color: var(--gold-strong); transform: scale(1.08); }
  .rmp-trump-clear { background: none; border: none; color: var(--text-faint); cursor: pointer; font-size: 0.8125rem; margin-left: 2px; padding: 4px; }
  .rmp-trump-clear:hover { color: var(--text); }

  /* ── NUMPAD ── */
  .numpad { padding: 8px 16px 0; }
  .numpad-display { font-size: 1.375rem; font-weight: 800; color: var(--gold-strong); text-align: center; padding: 6px 0 10px; border-bottom: 1px solid var(--border); margin-bottom: 8px; min-height: 40px; }
  .numpad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .numpad-key { height: 48px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 1.0625rem; font-weight: 600; cursor: pointer; transition: background-color 120ms; -webkit-tap-highlight-color: transparent; }
  .numpad-key:active { background: var(--surface-hover); }
  .numpad-key.is-ok { background: var(--gold-wash); border-color: var(--gold-border); color: var(--gold-strong); }
  .numpad-key.is-ok:active { background: var(--gold-border); }
  .numpad-key.is-del { color: var(--text-faint); }

  .block-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
  .block-wrapper::-webkit-scrollbar-track { background: transparent; }
  .block-wrapper::-webkit-scrollbar-thumb { background: var(--gold-border); border-radius: var(--radius-xs); }

  @media (max-width: 400px) {
    :root { --cell-w: 64px; --cell-h: 48px; --row-label-w: 36px; --trump-col-w: 34px; }
  }
`;

// ─── Small Components ─────────────────────────────────────────────────────────

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast" role="status">{msg}</div>;
}

function ConfirmDialog({ message, confirmLabel = "Ja, sicher", onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="confirm-box">
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="btn btn-danger-solid" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// One consolidated emblem instead of four separate glowing icons — a quieter,
// single brand moment for the menu screen only.
function WizardEmblem() {
  return (
    <svg className="wizard-emblem" width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">
      <circle cx="38" cy="38" r="35" stroke="var(--gold-border)" strokeWidth="1.5" />
      <circle cx="38" cy="38" r="27" stroke="var(--gold-border)" strokeWidth="1" opacity="0.6" />
      <path d="M38 14 L43 34 L38 40 L33 34 Z" fill="var(--gold-strong)" />
      <circle cx="38" cy="10" r="3" fill="var(--trump-red)" />
      <circle cx="66" cy="38" r="3" fill="var(--trump-blue)" />
      <circle cx="38" cy="66" r="3" fill="var(--trump-green)" />
      <circle cx="10" cy="38" r="3" fill="var(--trump-yellow)" />
    </svg>
  );
}

// ─── Trump Picker ─────────────────────────────────────────────────────────────

function TrumpSwatch({ suit, active, size = 28, onClick, className = "", title }) {
  if (!suit) return null;
  return (
    <button
      type="button"
      className={`suit-swatch suit-swatch--${suit.key} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      onClick={onClick}
      title={title || suit.name}
      aria-label={`Trumpf ${suit.name}`}
      aria-pressed={active}
    >
      {suit.glyph}
    </button>
  );
}

function TrumpPicker({ current, onSelect, anchorRef }) {
  const style = { top: 60, left: 10 };
  if (anchorRef?.current) {
    const r = anchorRef.current.getBoundingClientRect();
    style.top = r.bottom + 6;
    style.left = Math.min(r.left, window.innerWidth - 250);
  }
  return (
    <div className="trump-picker" style={{ ...style, position: "fixed" }} role="menu" aria-label="Trumpffarbe wählen">
      {TRUMP_SUITS.map(s => (
        <div key={s.key} className={`trump-picker-btn${current === s.key ? " active" : ""}`}>
          <TrumpSwatch suit={s} size={34} active={current === s.key} onClick={() => onSelect(s.key)} />
          <span className="trump-picker-label">{s.name}</span>
        </div>
      ))}
      <button type="button" className="trump-picker-clear" onClick={() => onSelect(null)}>Löschen</button>
    </div>
  );
}

// ─── Block Cell ───────────────────────────────────────────────────────────────

const BlockCell = ({ data, onChange, isActive, isCurrent, playerName, round }) => {
  if (!isActive) return <div className="block-cell is-inactive" />;
  const pts = calcPoints(data.announced, data.tricks);
  const correct = pts !== null && parseInt(data.announced, 10) === parseInt(data.tricks, 10);
  const wrong = pts !== null && !correct;
  let cls = "block-cell" + (correct ? " is-correct" : wrong ? " is-wrong" : isCurrent ? " is-current-round" : "");
  return (
    <div className={cls}>
      <div className="cell-inner">
        <div className="cell-row">
          <span className="cell-label" aria-hidden="true">A</span>
          <input className="cell-input" type="number" min="0" inputMode="numeric" aria-label={`Ansage, Runde ${round}, ${playerName}`} value={data.announced} onChange={e => onChange({ ...data, announced: e.target.value })} />
        </div>
        <div className="cell-divider" />
        <div className="cell-row">
          <span className="cell-label" aria-hidden="true">S</span>
          <input className="cell-input" type="number" min="0" inputMode="numeric" aria-label={`Stiche, Runde ${round}, ${playerName}`} value={data.tricks} onChange={e => onChange({ ...data, tricks: e.target.value })} />
        </div>
      </div>
      {pts !== null && <div className={`cell-pts ${pts >= 0 ? "is-pos" : "is-neg"}`}>{pts > 0 ? "+" : ""}{pts}</div>}
    </div>
  );
};

const CumulativeCell = ({ value, isActive }) => (
  <div className={`cumulative-cell${!isActive || value === null ? "" : value >= 0 ? " is-pos" : " is-neg"}`} style={{ background: isActive ? "var(--paper-tint)" : "var(--paper-ink)" }}>
    {isActive && value !== null ? value : ""}
  </div>
);

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange, onOk }) {
  const handleKey = (k) => {
    if (k === "DEL") { onChange(""); return; }
    if (k === "OK") { onOk(); return; }
    if (k === "0" && value === "0") return;
    const next = value === "" ? k : value + k;
    if (parseInt(next, 10) > 60) return;
    onChange(next);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "DEL", "0", "OK"];
  return (
    <div className="numpad">
      <div className="numpad-display">{value === "" ? "—" : value}</div>
      <div className="numpad-grid">
        {keys.map(k => (
          <button key={k} type="button" className={`numpad-key${k === "OK" ? " is-ok" : k === "DEL" ? " is-del" : ""}`} onClick={() => handleKey(k)} aria-label={k === "DEL" ? "Löschen" : k === "OK" ? "Bestätigen" : k}>
            {k === "DEL" ? "⌫" : k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Round Modal ──────────────────────────────────────────────────────────────

function RoundModal({ game, round, onUpdateCell, onClose, onSetTrump }) {
  const { players, playerCount, grid } = game;
  const [active, setActive] = useState({ playerIdx: 0, field: "announced" });
  const activeData = grid[round]?.[active.playerIdx] || { announced: "", tricks: "" };

  const advance = () => {
    if (active.field === "announced") {
      setActive({ playerIdx: active.playerIdx, field: "tricks" });
    } else if (active.playerIdx < playerCount - 1) {
      setActive({ playerIdx: active.playerIdx + 1, field: "announced" });
    }
  };

  const handleChange = (val) => {
    const updated = { ...activeData, [active.field]: val };
    onUpdateCell(round, active.playerIdx, updated);
  };

  const trumpKey = game.trump?.[round];
  const isLast = active.playerIdx === playerCount - 1 && active.field === "tricks";

  return (
    <div className="modal-overlay round-modal-overlay" role="dialog" aria-modal="true" aria-label={`Runde ${round} eintragen`}>
      <div className="round-modal">
        <div className="round-modal-header">
          <div className="round-modal-title">Runde {round}</div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Schließen</button>
        </div>

        <div className="round-modal-meta">
          <div className="round-modal-meta-item">
            <div className="round-modal-meta-label">Austeiler</div>
            <div className="round-modal-meta-value">
              {players[(((game.firstPlayer?.[round] ?? 0) - 1) + playerCount) % playerCount]}
            </div>
          </div>
          <div className="round-modal-meta-item">
            <div className="round-modal-meta-label">Erster Ansager</div>
            <div className="round-modal-meta-value is-accent">
              {players[game.firstPlayer?.[round] ?? 0]}
            </div>
          </div>
        </div>

        <div className="rmp-trump-row">
          <span className="rmp-trump-label">Trumpf:</span>
          {TRUMP_SUITS.map(s => (
            <TrumpSwatch key={s.key} suit={s} size={32} active={trumpKey === s.key} className={`rmp-trump-swatch${trumpKey === s.key ? " active" : ""}`} onClick={() => onSetTrump(round, s.key)} />
          ))}
          {trumpKey && <button type="button" className="rmp-trump-clear" onClick={() => onSetTrump(round, null)} aria-label="Trumpf löschen">✕</button>}
        </div>

        <div className="round-modal-players">
          {players.map((name, p) => {
            const data = grid[round]?.[p] || { announced: "", tricks: "" };
            const pts = calcPoints(data.announced, data.tricks);
            const correct = pts !== null && parseInt(data.announced, 10) === parseInt(data.tricks, 10);
            const wrong = pts !== null && !correct;
            const isActivePlayer = active.playerIdx === p;
            return (
              <div key={p} className={`round-modal-player${isActivePlayer ? " is-active" : ""}`}>
                <div className="rmp-name">{name}</div>
                <div className="rmp-fields">
                  <button type="button" className={`rmp-field${isActivePlayer && active.field === "announced" ? " is-active" : ""}`} onClick={() => setActive({ playerIdx: p, field: "announced" })}>
                    <div className="rmp-field-label">ANSAGE</div>
                    <div className="rmp-field-val">{data.announced === "" ? "—" : data.announced}</div>
                  </button>
                  <button type="button" className={`rmp-field${isActivePlayer && active.field === "tricks" ? " is-active" : ""}`} onClick={() => setActive({ playerIdx: p, field: "tricks" })}>
                    <div className="rmp-field-label">STICHE</div>
                    <div className="rmp-field-val">{data.tricks === "" ? "—" : data.tricks}</div>
                  </button>
                  <div className={`rmp-pts${correct ? " is-pos" : wrong ? " is-neg" : ""}`}>
                    {pts !== null ? (pts > 0 ? `+${pts}` : pts) : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rmp-active-label">
          {players[active.playerIdx]} — {active.field === "announced" ? "Ansage" : "Stiche"}
        </div>

        <Numpad value={activeData[active.field]} onChange={handleChange} onOk={advance} />

        <div className="rmp-actions">
          <button className="btn btn-primary" onClick={advance}>{isLast ? "Fertig" : "Weiter"}</button>
          <button className="btn btn-secondary" onClick={onClose}>Runde beenden</button>
        </div>
      </div>
    </div>
  );
}

// ─── Wizard Block ─────────────────────────────────────────────────────────────

function WizardBlock({ game, currentRound, onUpdateCell, onOpenRound, onSetTrump }) {
  const { playerCount, players, grid } = game;
  const maxRounds = maxRoundsForPlayers(playerCount);
  const totals = calcTotals(game);
  const scores = players.map((_, p) => totals[p].sum);
  const maxScore = Math.max(...scores);
  const winnerIdx = scores.indexOf(maxScore);
  const allLimits = [
    { players: 6, maxR: maxRoundsForPlayers(6) },
    { players: 5, maxR: maxRoundsForPlayers(5) },
    { players: 4, maxR: maxRoundsForPlayers(4) },
    { players: 3, maxR: maxRoundsForPlayers(3) },
  ];
  const [trumpPickerRound, setTrumpPickerRound] = useState(null);
  const trumpBtnRefs = useRef({});

  return (
    <div className="block-outer" onClick={e => { if (!e.target.closest(".trump-cell") && !e.target.closest(".trump-picker")) setTrumpPickerRound(null); }}>
      <div>
        <div className="block-header-row">
          <div className="block-corner" />
          {players.map((name, p) => (
            <div key={p} className={`block-player-header${p === winnerIdx && totals[p].sum > 0 ? " is-winner" : ""}`}>
              {name}
            </div>
          ))}
          <div className="block-trump-corner">Trumpf</div>
        </div>

        {Array.from({ length: MAX_ROUNDS }, (_, ri) => {
          const round = ri + 1;
          const active = round <= maxRounds;
          const isCur = round === currentRound;
          const labelsHere = allLimits.filter(l => l.maxR + 1 === round && l.players !== playerCount);
          const cumulative = players.map((_, p) => {
            if (!active) return null;
            let sum = 0, hasAny = false;
            for (let r = 1; r <= round; r++) {
              const cell = grid[r]?.[p];
              const pts = cell ? calcPoints(cell.announced, cell.tricks) : null;
              if (pts !== null) { sum += pts; hasAny = true; }
            }
            return hasAny ? sum : null;
          });
          const trumpKey = game.trump?.[round];
          const trumpSuit = trumpKey ? TRUMP_BY_KEY[trumpKey] : null;

          return (
            <div key={round}>
              {labelsHere.map(l => (
                <div className="stair-label-row" key={`lbl-${l.players}`}>
                  <div className="block-row-label" style={{ color: "oklch(94% 0.008 275 / 25%)", cursor: "default" }}>—</div>
                  <div className="stair-label-cell" style={{ width: `calc(var(--cell-w) * ${playerCount} + var(--trump-col-w))` }}>
                    <span className="stair-label-text">▲ {l.players} Spieler</span>
                  </div>
                </div>
              ))}
              <div className="block-row">
                <div className={`block-row-label${isCur ? " is-current" : ""}`} onClick={() => active && onOpenRound(round)}>
                  {round}
                </div>
                {players.map((name, p) => (
                  <BlockCell key={p} data={grid[round]?.[p] || { announced: "", tricks: "" }} isActive={active} isCurrent={isCur && active} playerName={name} round={round} onChange={v => onUpdateCell(round, p, v)} />
                ))}
                <div ref={el => trumpBtnRefs.current[round] = el} className={`trump-cell${!active ? " is-inactive" : ""}`} onClick={() => active && setTrumpPickerRound(prev => prev === round ? null : round)} role={active ? "button" : undefined} aria-label={active ? `Trumpf Runde ${round}${trumpSuit ? `, ${trumpSuit.name}` : ""}` : undefined}>
                  {active ? (
                    trumpSuit
                      ? <TrumpSwatch suit={trumpSuit} size={22} />
                      : <span className="trump-empty">+</span>
                  ) : null}
                </div>
              </div>
              <div className="cumulative-row">
                <div className="cumulative-label">{active ? "∑" : ""}</div>
                {players.map((_, p) => <CumulativeCell key={p} value={cumulative[p]} isActive={active} />)}
                <div className="cumulative-trump" style={{ background: active ? "var(--paper-tint-soft)" : "var(--paper-ink)" }} />
              </div>
            </div>
          );
        })}

        <div className="totals-row">
          <div className="totals-label">∑</div>
          {players.map((_, p) => (
            <div key={p} className={`totals-cell${p === winnerIdx && totals[p].sum > 0 ? " is-winner" : ""}`}>{totals[p].sum}</div>
          ))}
          <div className="totals-trump" />
        </div>
        <div className="block-imprint">
          <div>
            <div className="block-imprint-mark">WIZARD</div>
            <div className="block-imprint-title">Der Block der Wahrheit</div>
          </div>
        </div>
      </div>
      {trumpPickerRound !== null && (
        <TrumpPicker current={game.trump?.[trumpPickerRound]} onSelect={key => { onSetTrump(trumpPickerRound, key); setTrumpPickerRound(null); }} anchorRef={{ current: trumpBtnRefs.current[trumpPickerRound] }} />
      )}
    </div>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function LineChart({ stats, maxRounds }) {
  const W = Math.max(300, maxRounds * 28), H = 160;
  const PAD = { top: 16, right: 16, bottom: 24, left: 36 };
  const chartW = W - PAD.left - PAD.right, chartH = H - PAD.top - PAD.bottom;
  const allVals = stats.flatMap(s => s.roundPoints);
  const minVal = Math.min(0, ...allVals), maxVal = Math.max(0, ...allVals);
  const range = maxVal - minVal || 1;
  const xScale = i => PAD.left + (i / maxRounds) * chartW;
  const yScale = v => PAD.top + chartH - ((v - minVal) / range) * chartH;
  const gridVals = [];
  const step = range <= 10 ? 2 : range <= 30 ? 5 : range <= 60 ? 10 : 20;
  for (let v = Math.ceil(minVal / step) * step; v <= maxVal; v += step) gridVals.push(v);
  return (
    <svg width={W} height={H} style={{ display: "block", minWidth: W }} role="img" aria-label="Punkteverlauf über die Runden">
      {gridVals.map(v => (
        <g key={v}>
          <line x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)} stroke="oklch(94% 0.008 275 / 8%)" strokeWidth="1" />
          <text x={PAD.left - 4} y={yScale(v) + 4} textAnchor="end" fill="oklch(94% 0.008 275 / 45%)" fontSize="10">{v}</text>
        </g>
      ))}
      {minVal < 0 && <line x1={PAD.left} y1={yScale(0)} x2={W - PAD.right} y2={yScale(0)} stroke="oklch(94% 0.008 275 / 22%)" strokeWidth="1" strokeDasharray="4,3" />}
      {Array.from({ length: maxRounds + 1 }, (_, i) => i).filter(i => i % (maxRounds > 12 ? 3 : 2) === 0).map(i => (
        <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fill="oklch(94% 0.008 275 / 38%)" fontSize="9">{i}</text>
      ))}
      {stats.map((s, pi) => (
        <g key={pi}>
          <polyline points={s.roundPoints.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ")} fill="none" stroke={PLAYER_COLORS[pi % PLAYER_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {s.roundPoints.map((v, i) => i > 0 && <circle key={i} cx={xScale(i)} cy={yScale(v)} r="2.5" fill={PLAYER_COLORS[pi % PLAYER_COLORS.length]} />)}
        </g>
      ))}
    </svg>
  );
}

const TRUMP_PIE_COLORS = { red: "var(--trump-red)", green: "var(--trump-green)", blue: "var(--trump-blue)", yellow: "var(--trump-yellow)", none: "var(--trump-none)" };

function PieChart({ freq }) {
  const entries = TRUMP_SUITS.map(s => ({ ...s, count: freq[s.key] || 0 })).filter(e => e.count > 0);
  const total = entries.reduce((a, e) => a + e.count, 0);
  if (total === 0) return <p className="empty-note">Noch keine Trumpffarben eingetragen.</p>;
  const R = 56, cx = 70, cy = 70;
  let angle = -Math.PI / 2;
  const slices = entries.map(e => {
    const start = angle, sweep = (e.count / total) * Math.PI * 2;
    angle += sweep;
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(angle), y2 = cy + R * Math.sin(angle);
    return { ...e, path: `M${cx},${cy} L${x1},${y1} A${R},${R},0,${sweep > Math.PI ? 1 : 0},1,${x2},${y2} Z` };
  });
  return (
    <div className="pie-wrap">
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flexShrink: 0 }} role="img" aria-label="Trumpffarben-Häufigkeit">
        {slices.map(s => <path key={s.key} d={s.path} fill={TRUMP_PIE_COLORS[s.key]} />)}
        <circle cx={cx} cy={cy} r={24} fill="var(--bg)" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="oklch(94% 0.008 275 / 55%)" fontSize="11">{total}×</text>
      </svg>
      <div className="pie-legend">
        {slices.map(s => (
          <div key={s.key} className="pie-legend-item">
            <TrumpSwatch suit={s} size={18} />
            <span>{s.name}</span>
            <span className="pie-legend-count">{s.count}×</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats Screen ─────────────────────────────────────────────────────────────

function StatsScreen({ game, onBack, onFinish }) {
  const maxR = maxRoundsForPlayers(game.playerCount);
  const stats = calcStats(game);
  const totals = calcTotals(game);
  const freq = calcTrumpFrequency(game);
  const ranked = stats.map((s, i) => ({ ...s, idx: i, total: totals[i].sum })).sort((a, b) => b.total - a.total);
  const winner = ranked[0];
  return (
    <div className="stats-screen">
      <div className="game-header">
        <div className="game-header-title">Auswertung</div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>Zurück</button>
        {onFinish && <button className="btn btn-primary btn-sm" onClick={onFinish}>Abschließen</button>}
      </div>
      <div className="stats-body">
        <div className="stats-title">Auswertung</div>
        <div className="stats-subtitle">{game.name} · {game.playerCount} Spieler</div>
        <div className="winner-banner">
          <span className="winner-crown">👑</span>
          <div className="winner-name">{winner.name}</div>
          <div className="winner-score">{winner.total} Punkte · {winner.rate}% Trefferquote</div>
        </div>
        <div className="stat-cards">
          {ranked.map((s, rank) => (
            <div key={s.idx} className={`stat-card${rank === 0 ? " is-winner" : ""}`}>
              <div className="stat-rank">{rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : rank + 1}</div>
              <div className="stat-info">
                <div className="stat-player-name" style={{ color: PLAYER_COLORS[s.idx % PLAYER_COLORS.length] }}>{s.name}</div>
                <div className="stat-row">
                  <span className="stat-item">Richtig: <strong>{s.correct}/{s.total}</strong></span>
                  <span className="stat-item">Quote: <strong>{s.rate}%</strong></span>
                </div>
                <div className="hit-bar-wrap">
                  <div className="hit-bar-track"><div className="hit-bar-fill" style={{ transform: `scaleX(${s.rate / 100})` }} /></div>
                  <div className="hit-bar-label">{s.rate}% Trefferquote</div>
                </div>
              </div>
              <div className="stat-score">{s.total}</div>
            </div>
          ))}
        </div>
        <div className="chart-section">
          <div className="chart-heading">Punkteverlauf</div>
          <div className="chart-box">
            <div style={{ overflowX: "auto" }}><LineChart stats={stats} maxRounds={maxR} /></div>
            <div className="chart-legend">
              {stats.map((s, i) => (
                <div key={i} className="chart-legend-item">
                  <div className="chart-legend-dot" style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                  {s.name}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pie-section">
          <div className="chart-heading">Trumpffarben-Häufigkeit</div>
          <div className="chart-box"><PieChart freq={freq} /></div>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Detail ───────────────────────────────────────────────────────────

function ProfileDetail({ profile, onBack, onDelete }) {
  const achs = computeAchievements(profile);
  return (
    <div className="profiles-screen">
      <div className="game-header">
        <div className="game-header-title">{profile.name}</div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>Zurück</button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Löschen</button>
      </div>
      <div className="profiles-body">
        <div className="stats-title">{profile.name}</div>
        <div className="stats-subtitle">Spielerprofil</div>
        <div className="winner-banner">
          <span className="winner-crown">⚔️</span>
          <div className="winner-name">{profile.wins} Siege</div>
          <div className="winner-score">{profile.gamesPlayed} Spiele · Ø {profile.avgRate}% Trefferquote</div>
        </div>
        <div className="stat-cards" style={{ marginBottom: 14 }}>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-row" style={{ gap: 18, flexWrap: "wrap" }}>
                <span className="stat-item">Spiele: <strong>{profile.gamesPlayed}</strong></span>
                <span className="stat-item">Siege: <strong>{profile.wins}</strong></span>
                <span className="stat-item">Bester Score: <strong>{profile.bestScore}</strong></span>
                <span className="stat-item">Beste Quote: <strong>{profile.bestRate}%</strong></span>
                <span className="stat-item">Ø Quote: <strong>{profile.avgRate}%</strong></span>
                <span className="stat-item">Gesamtpunkte: <strong>{profile.totalPoints}</strong></span>
              </div>
            </div>
          </div>
        </div>
        <div className="chart-heading" style={{ marginBottom: 10 }}>Abzeichen</div>
        <div className="achievements-grid">
          {achs.map(a => (
            <div key={a.id} className={`achievement${a.unlocked ? " is-unlocked" : " is-locked"}`}>
              <span className="achievement-icon" aria-hidden="true">{a.icon}</span>
              <div className="achievement-info">
                <div className="achievement-label">{a.label}</div>
                <div className="achievement-desc">{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Profiles Screen ──────────────────────────────────────────────────────────

function ProfilesScreen({ onBack }) {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const addProfile = () => {
    const name = newName.trim();
    if (!name) return;
    const updated = [...profiles, createEmptyProfile(name)];
    setProfiles(updated); saveProfiles(updated); setNewName("");
  };

  const deleteProfile = (id) => {
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated); saveProfiles(updated); setSelected(null); setConfirm(null);
  };

  if (selected) {
    const profile = profiles.find(p => p.id === selected);
    if (!profile) { setSelected(null); return null; }
    return <ProfileDetail profile={profile} onBack={() => setSelected(null)} onDelete={() => setConfirm({ id: profile.id, name: profile.name })} />;
  }

  return (
    <div className="profiles-screen">
      <div className="game-header">
        <div className="game-header-title">Spielerprofile</div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>Zurück</button>
      </div>
      <div className="profiles-body">
        <div className="stats-title" style={{ marginBottom: 4 }}>Profile</div>
        <div className="stats-subtitle">Langzeit-Statistiken &amp; Abzeichen</div>
        <div className="field">
          <label>Neues Profil erstellen</label>
          <div className="new-profile-row">
            <input className="text-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name eingeben…" onKeyDown={e => e.key === "Enter" && addProfile()} />
            <button className="btn btn-primary" onClick={addProfile}>+ Erstellen</button>
          </div>
        </div>
        {profiles.length === 0
          ? <div className="empty-state">Noch keine Profile vorhanden. Lege eins an, um Siege und Abzeichen über mehrere Spiele zu verfolgen.</div>
          : (
            <div className="profile-cards">
              {profiles.map(p => {
                const achs = computeAchievements(p).filter(a => a.unlocked);
                return (
                  <div key={p.id} className="profile-card" onClick={() => setSelected(p.id)}>
                    <div className="profile-card-header">
                      <div className="profile-card-name">{p.name}</div>
                      <button className="btn-icon btn btn-secondary" style={{ width: 32, height: 32 }} onClick={e => { e.stopPropagation(); setConfirm({ id: p.id, name: p.name }); }} aria-label={`Profil ${p.name} löschen`}>✕</button>
                    </div>
                    <div className="profile-stats-row">
                      <span className="profile-stat">Spiele: <strong>{p.gamesPlayed}</strong></span>
                      <span className="profile-stat">Siege: <strong>{p.wins}</strong></span>
                      <span className="profile-stat">Ø Quote: <strong>{p.avgRate}%</strong></span>
                    </div>
                    {achs.length > 0 && (
                      <div className="profile-card-badges">
                        {achs.map(a => <span key={a.id} title={a.label} style={{ fontSize: "1rem" }}>{a.icon}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        }
      </div>
      {confirm && <ConfirmDialog message={`Profil "${confirm.name}" wirklich löschen?`} onConfirm={() => deleteProfile(confirm.id)} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

// ─── Setup Modal ──────────────────────────────────────────────────────────────

function SetupModal({ onStart, onCancel }) {
  const [gameName, setGameName] = useState("Wizard Abend");
  const [playerCount, setPlayerCount] = useState(4);
  const [slots, setSlots] = useState(Array.from({ length: 6 }, () => ({ profileId: null, customName: "" })));
  const profiles = loadProfiles();

  const getDisplayName = (slot) => {
    if (slot.profileId) { const p = profiles.find(p => p.id === slot.profileId); return p ? p.name : slot.customName; }
    return slot.customName;
  };
  const selectProfile = (i, profileId) => { const u = [...slots]; u[i] = { profileId, customName: "" }; setSlots(u); };
  const clearSlot = (i) => { const u = [...slots]; u[i] = { profileId: null, customName: "" }; setSlots(u); };
  const setCustomName = (i, name) => { const u = [...slots]; u[i] = { profileId: null, customName: name }; setSlots(u); };
  const takenIds = slots.slice(0, playerCount).map(s => s.profileId).filter(Boolean);

  const handleStart = () => {
    const active = slots.slice(0, playerCount);
    const players = active.map((s, i) => getDisplayName(s) || `Spieler ${i + 1}`);
    const profileIds = active.map(s => s.profileId);
    onStart({ name: gameName, players, playerCount, profileIds });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Neues Spiel">
      <div className="modal">
        <div className="modal-title">Neues Spiel</div>
        <div className="field">
          <label htmlFor="game-name">Spielname</label>
          <input id="game-name" value={gameName} onChange={e => setGameName(e.target.value)} />
        </div>
        <div className="field">
          <label>Anzahl Spieler</label>
          <div className="player-count-grid">
            {[3, 4, 5, 6].map(n => (
              <button key={n} type="button" className={`player-count-btn${playerCount === n ? " active" : ""}`} onClick={() => setPlayerCount(n)} aria-pressed={playerCount === n}>
                {n}<span>{maxRoundsForPlayers(n)} Runden</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Spieler</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {Array.from({ length: playerCount }, (_, i) => {
              const slot = slots[i];
              const profile = slot.profileId ? profiles.find(p => p.id === slot.profileId) : null;
              const achs = profile ? computeAchievements(profile).filter(a => a.unlocked) : [];
              return (
                <div key={i} className={`player-slot${profile ? " has-profile" : ""}`}>
                  <div className="player-slot-row">
                    <span className="player-slot-index">{i + 1}.</span>
                    {profile ? (
                      <>
                        <span className="player-slot-name">{profile.name}</span>
                        <button type="button" className="player-slot-clear" onClick={() => clearSlot(i)} aria-label={`${profile.name} entfernen`}>✕</button>
                      </>
                    ) : (
                      <input className="text-input" value={slot.customName} onChange={e => setCustomName(i, e.target.value)} placeholder={`Spieler ${i + 1} eingeben…`} aria-label={`Name für Spieler ${i + 1}`} />
                    )}
                  </div>
                  {profile && (
                    <div className="player-slot-stats">
                      <span className="player-slot-stat">Siege: <strong>{profile.wins}</strong></span>
                      <span className="player-slot-stat">Spiele: <strong>{profile.gamesPlayed}</strong></span>
                      <span className="player-slot-stat">Ø Quote: <strong>{profile.avgRate}%</strong></span>
                      {achs.length > 0 && <span style={{ fontSize: "0.85rem" }}>{achs.slice(0, 4).map(a => a.icon).join(" ")}</span>}
                    </div>
                  )}
                  {!profile && profiles.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      <span className="player-slot-picker-label">Profil wählen</span>
                      {profiles.filter(p => !takenIds.includes(p.id)).map(p => (
                        <button key={p.id} type="button" className="profile-pill" onClick={() => selectProfile(i, p.id)}>{p.name}</button>
                      ))}
                      {profiles.filter(p => !takenIds.includes(p.id)).length === 0 && (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>Alle Profile bereits vergeben</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleStart}>Starten</button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Screen ──────────────────────────────────────────────────────────────

function MenuScreen({ onNewGame, onOpenProfiles }) {
  const [showSetup, setShowSetup] = useState(false);
  const [games, setGames] = useState(loadGames);

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const updated = games.filter(g => g.id !== id);
    setGames(updated); saveGames(updated);
  };

  return (
    <div className="menu-screen">
      <div className="menu-emblem"><WizardEmblem /></div>
      <div className="menu-wordmark">Wizard</div>
      <div className="menu-tagline">Score Tracker · Block der Wahrheit</div>
      <div className="menu-actions">
        <button className="btn btn-primary btn-block" onClick={() => setShowSetup(true)}>Neues Spiel</button>
        <button className="btn btn-secondary btn-block" onClick={onOpenProfiles}>Spielerprofile</button>
      </div>
      <div className="saved-list">
        {games.length === 0
          ? <div className="empty-state">Noch keine Spiele gespeichert.</div>
          : <>
              <div className="saved-list-title">Gespeicherte Spiele</div>
              {games.slice().reverse().map(g => (
                <div className="saved-item" key={g.id} onClick={() => onNewGame(g, true)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="saved-item-name">{g.name}</div>
                    <div className="saved-item-date">{new Date(g.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                    <div className="saved-item-meta">{g.playerCount} Spieler · Runde {g.currentRound}</div>
                    <div className="saved-item-players">{g.players?.join(" · ")}</div>
                  </div>
                  <button className="btn btn-icon btn-secondary" style={{ width: 32, height: 32 }} onClick={e => handleDelete(g.id, e)} aria-label={`Spiel ${g.name} löschen`}>✕</button>
                </div>
              ))}
            </>
        }
      </div>
      {showSetup && <SetupModal onStart={opts => { setShowSetup(false); onNewGame(opts, false); }} onCancel={() => setShowSetup(false)} />}
    </div>
  );
}

// ─── Game Screen ──────────────────────────────────────────────────────────────

function GameScreen({ initialGame, onExit }) {
  const [game, setGame] = useState(initialGame);
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [roundModal, setRoundModal] = useState(null);
  const toastTimer = useRef(null);

  const showToast = msg => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2500); };

  const updateCell = useCallback((round, playerIdx, value) => {
    setGame(prev => {
      const newGrid = { ...prev.grid, [round]: { ...prev.grid[round], [playerIdx]: value } };
      let cr = prev.currentRound;
      const maxR = maxRoundsForPlayers(prev.playerCount);
      if (round === cr && cr < maxR) {
        const allFilled = Array.from({ length: prev.playerCount }, (_, i) => i).every(i => { const c = i === playerIdx ? value : prev.grid[round]?.[i]; return c && c.announced !== "" && c.tricks !== ""; });
        if (allFilled) cr = Math.min(cr + 1, maxR);
      }
      return { ...prev, grid: newGrid, currentRound: cr, updatedAt: new Date().toISOString() };
    });
  }, []);

  const setTrump = useCallback((round, key) => {
    setGame(prev => ({ ...prev, trump: { ...prev.trump, [round]: key }, updatedAt: new Date().toISOString() }));
  }, []);

  const saveGame = () => {
    const games = loadGames();
    const idx = games.findIndex(g => g.id === game.id);
    if (idx >= 0) games[idx] = game; else games.push(game);
    saveGames(games); showToast("✓ Spiel gespeichert");
  };

  const handleFinish = () => {
    const profiles = loadProfiles();
    saveProfiles(applyGameToProfiles(game, profiles));
    saveGame();
    showToast("✓ Statistiken gespeichert!");
    setTimeout(() => onExit(), 1200);
  };

  const totals = calcTotals(game);
  const scores = game.players.map((_, p) => totals[p].sum);
  const maxScore = Math.max(...scores);
  const leader = game.players[scores.indexOf(maxScore)];
  const maxR = maxRoundsForPlayers(game.playerCount);

  if (showStats) return <StatsScreen game={game} onBack={() => setShowStats(false)} onFinish={handleFinish} />;

  return (
    <div className="game-screen">
      <div className="game-header">
        <div className="game-header-title">{game.name}</div>
        <button className="btn btn-secondary btn-sm" onClick={saveGame}>Speichern</button>
        <button className="btn btn-icon btn-secondary" onClick={() => setShowStats(true)} aria-label="Auswertung anzeigen">📊</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setConfirm({ msg: "Alle Einträge zurücksetzen?", onConfirm: () => { setConfirm(null); setGame(prev => createEmptyGame({ name: prev.name, players: prev.players, playerCount: prev.playerCount, profileIds: prev.profileIds })); showToast("✓ Zurückgesetzt"); } })}>Reset</button>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ msg: "Spiel beenden? Vorher speichern!", onConfirm: () => { setConfirm(null); onExit(); } })}>Ende</button>
      </div>
      <div className="round-info">
        <span className="round-info-item">Runde: <strong>{game.currentRound}/{maxR}</strong></span>
        <span className="round-info-item">{game.playerCount} Spieler</span>
        {maxScore > 0 && <span className="round-info-item">Führt: <strong>{leader}</strong> ({maxScore})</span>}
      </div>
      <div className="block-wrapper">
        <WizardBlock game={game} onUpdateCell={updateCell} currentRound={game.currentRound} onSetTrump={setTrump} onOpenRound={setRoundModal} />
      </div>
      {confirm && <ConfirmDialog message={confirm.msg} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      {roundModal !== null && <RoundModal game={game} round={roundModal} onUpdateCell={updateCell} onClose={() => setRoundModal(null)} onSetTrump={setTrump} />}
      <Toast msg={toast} />
    </div>
  );
}

// ─── Arcane Background ─────────────────────────────────────────────────────────
// Calm, mostly-static ground: no per-frame competing animation while a player
// is trying to read the grid.

function ArcaneBg() {
  return (
    <div className="arcane-bg" aria-hidden="true">
      <div className="arcane-bg__glow" />
      <svg className="arcane-bg__stars" width="100%" height="100%">
        <defs>
          <pattern id="starfield" width="120" height="120" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="20" r="1" fill="oklch(78% 0.13 85 / 40%)" />
            <circle cx="70" cy="55" r="1.2" fill="oklch(94% 0.008 275 / 30%)" />
            <circle cx="100" cy="14" r="0.8" fill="oklch(78% 0.13 85 / 30%)" />
            <circle cx="40" cy="90" r="1" fill="oklch(94% 0.008 275 / 25%)" />
            <circle cx="90" cy="100" r="0.8" fill="oklch(78% 0.13 85 / 25%)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#starfield)" />
      </svg>
      <div className="arcane-bg__vignette" />
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [activeGame, setActiveGame] = useState(null);
  return (
    <>
      <style>{css}</style>
      <ArcaneBg />
      {screen === "menu" && (
        <MenuScreen
          onNewGame={(opts, isExisting) => { setActiveGame(isExisting ? opts : createEmptyGame(opts)); setScreen("game"); }}
          onOpenProfiles={() => setScreen("profiles")}
        />
      )}
      {screen === "game" && activeGame && (
        <GameScreen initialGame={activeGame} onExit={() => { setActiveGame(null); setScreen("menu"); }} />
      )}
      {screen === "profiles" && <ProfilesScreen onBack={() => setScreen("menu")} />}
    </>
  );
}

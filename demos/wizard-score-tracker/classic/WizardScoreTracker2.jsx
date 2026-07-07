import React, { useState, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ROUNDS = 20;
const maxRoundsForPlayers = (n) => Math.floor(60 / n);

const TRUMP_SUITS = [
  { key: "red",    label: "", color: "#e82020", bg: "#e82020", name: "Rot"     },
  { key: "green",  label: "", color: "#22bb44", bg: "#22bb44", name: "Grün"    },
  { key: "blue",   label: "", color: "#2266dd", bg: "#2266dd", name: "Blau"    },
  { key: "yellow", label: "", color: "#ddb800", bg: "#ddb800", name: "Gelb"    },
  { key: "none",   label: "—",color: "#888",    bg: "#333",    name: "Farblos" },
];
const TRUMP_BY_KEY = Object.fromEntries(TRUMP_SUITS.map(s => [s.key, s]));

const PLAYER_COLORS = ["#7ef0ff","#44ff66","#ffcc00","#ff5522","#cc44ff","#ff88aa"];

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

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0d0f; --paper: #f5f0e8; --ink: #1a1008;
    --gold: #c9943a; --gold2: #e8b84b; --glow: rgba(201,148,58,0.35);
    --red: #8b1a1a; --green: #1a5c1a; --line: rgba(26,16,8,0.55);
    --cell-w: 72px; --cell-h: 48px; --row-label-w: 40px; --trump-col-w: 36px;
  }
  html, body, #root { min-height: 100vh; background: #0d0d0f; font-family: 'Crimson Text', Georgia, serif; color: var(--paper); overflow-x: hidden; }

  @keyframes ambientPulse { 0%{opacity:0.7} 50%{opacity:1.0} 100%{opacity:0.8} }
  @keyframes lavaGlow { 0%{opacity:0.5;filter:brightness(0.7)} 40%{opacity:0.9;filter:brightness(1.1)} 70%{opacity:0.7;filter:brightness(0.9)} 100%{opacity:1.0;filter:brightness(1.3)} }
  .crack-glow   { animation: lavaGlow 4s ease-in-out infinite alternate; }
  .crack-glow-2 { animation: lavaGlow 5s ease-in-out infinite alternate-reverse; animation-delay: -1s; }
  .crack-glow-3 { animation: lavaGlow 3.5s ease-in-out infinite alternate; animation-delay: -2s; }
  .crack-glow-4 { animation: lavaGlow 4.5s ease-in-out infinite alternate-reverse; animation-delay: -0.5s; }
  .crack-glow-5 { animation: lavaGlow 6s ease-in-out infinite alternate; animation-delay: -3s; }

  /* ── MENU ── */
  .menu-screen { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 32px 16px 48px; background: transparent; position: relative; z-index: 1; }
  .menu-title { font-family: 'Cinzel', serif; font-size: clamp(2.2rem, 9vw, 3.8rem); font-weight: 900; color: var(--gold2); text-shadow: 0 0 32px var(--glow), 0 2px 0 #000; text-align: center; margin-bottom: 4px; letter-spacing: 0.06em; }
  .menu-subtitle { font-family: 'Cinzel', serif; font-size: clamp(0.65rem, 2.5vw, 0.85rem); color: var(--gold); letter-spacing: 0.18em; text-transform: uppercase; text-align: center; margin-bottom: 28px; opacity: 0.7; }
  .menu-btn { display: block; width: 100%; max-width: 320px; padding: 14px 0; margin: 8px auto; background: linear-gradient(135deg, #1e1608, #2d2010); border: 1.5px solid var(--gold); border-radius: 4px; color: var(--gold2); font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 700; letter-spacing: 0.1em; cursor: pointer; text-align: center; box-shadow: 0 0 12px rgba(201,148,58,0.18); transition: box-shadow 0.2s, transform 0.1s; -webkit-tap-highlight-color: transparent; }
  .menu-btn:active { transform: scale(0.97); }
  .menu-btn:hover { box-shadow: 0 0 24px var(--glow); }
  .menu-btn.secondary { background: transparent; border-color: rgba(201,148,58,0.35); color: var(--gold); font-size: 0.9rem; }
  .menu-btn.danger { border-color: #8b1a1a; color: #ff6666; background: rgba(139,26,26,0.1); }
  .saved-list { width: 100%; max-width: 360px; margin: 0 auto; }
  .saved-list-title { font-family: 'Cinzel', serif; font-size: 0.7rem; letter-spacing: 0.18em; color: var(--gold); opacity: 0.55; text-transform: uppercase; margin-bottom: 10px; text-align: center; }
  .saved-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; margin-bottom: 8px; background: rgba(201,148,58,0.05); border: 1px solid rgba(201,148,58,0.2); border-radius: 5px; cursor: pointer; transition: background 0.15s; }
  .saved-item:hover { background: rgba(201,148,58,0.1); }
  .saved-item-name { font-family: 'Cinzel', serif; font-size: 0.95rem; color: var(--gold2); font-weight: 700; margin-bottom: 3px; }
  .saved-item-date { font-family: 'Cinzel', serif; font-size: 0.78rem; color: var(--gold); opacity: 0.9; margin-bottom: 2px; letter-spacing: 0.06em; }
  .saved-item-meta { font-size: 0.72rem; color: rgba(201,148,58,0.5); margin-bottom: 1px; }
  .saved-item-players { font-size: 0.70rem; color: rgba(245,240,232,0.35); font-style: italic; }
  .saved-item-del { background: none; border: none; color: rgba(139,26,26,0.7); font-size: 1.1rem; cursor: pointer; padding: 4px 6px; }
  .saved-item-del:hover { color: #c0392b; }
  .empty-state { text-align: center; color: rgba(245,240,232,0.25); font-family: 'Cinzel', serif; font-size: 0.8rem; padding: 24px 0; letter-spacing: 0.08em; }

  /* ── WIZARD SYMBOLS ── */
  .wizard-symbols { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 0 auto 24px; }
  .wsym-row { display: flex; gap: 20px; align-items: flex-end; }
  .wsym { transition: transform 0.3s, filter 0.3s; animation: symFloat 4s ease-in-out infinite; }
  .wsym:hover { transform: scale(1.15); }
  .wsym-sword   { width: 38px; height: 80px; animation-delay: 0s; }
  .wsym-chalice { width: 52px; height: 62px; animation-delay: 0.4s; }
  .wsym-coin    { width: 52px; height: 62px; animation-delay: 0.8s; }
  .wsym-trident { width: 52px; height: 72px; animation-delay: 1.2s; }
  @keyframes symFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }

  /* ── MODAL ── */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.82); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; overflow-y: auto; }
  .modal { background: rgba(14,10,6,0.92); backdrop-filter: blur(8px); border: 1.5px solid var(--gold); border-radius: 6px; padding: 24px 20px; width: 100%; max-width: 420px; box-shadow: 0 0 48px rgba(201,148,58,0.22); max-height: 90vh; overflow-y: auto; }
  .modal-title { font-family: 'Cinzel', serif; font-size: 1.1rem; color: var(--gold2); margin-bottom: 18px; text-align: center; letter-spacing: 0.08em; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-family: 'Cinzel', serif; font-size: 0.7rem; letter-spacing: 0.12em; color: var(--gold); opacity: 0.75; margin-bottom: 5px; text-transform: uppercase; }
  .field input, .field select { width: 100%; padding: 9px 11px; background: rgba(245,240,232,0.06); border: 1px solid rgba(201,148,58,0.35); border-radius: 3px; color: var(--paper); font-family: 'Crimson Text', serif; font-size: 1rem; }
  .field input:focus, .field select:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 8px rgba(201,148,58,0.2); }
  .field select option { background: #1a1408; color: var(--paper); }
  .modal-actions { display: flex; gap: 10px; margin-top: 20px; }
  .modal-actions .menu-btn { max-width: none; flex: 1; margin: 0; padding: 12px 0; }

  /* ── GAME HEADER ── */
  .game-screen { min-height: 100vh; display: flex; flex-direction: column; background: transparent; position: relative; z-index: 1; }
  .game-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(10,8,6,0.82); backdrop-filter: blur(4px); border-bottom: 1px solid rgba(201,148,58,0.25); position: sticky; top: 0; z-index: 50; }
  .game-header-title { font-family: 'Cinzel', serif; font-size: 0.85rem; color: var(--gold); letter-spacing: 0.1em; font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .header-btn { background: none; border: 1px solid rgba(201,148,58,0.4); color: var(--gold); font-family: 'Cinzel', serif; font-size: 0.7rem; letter-spacing: 0.08em; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 6px; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
  .header-btn:active { opacity: 0.7; }
  .round-info { display: flex; align-items: center; justify-content: space-between; padding: 6px 14px; background: rgba(0,0,0,0.4); border-bottom: 1px solid rgba(201,148,58,0.12); font-family: 'Cinzel', serif; font-size: 0.72rem; color: rgba(201,148,58,0.6); letter-spacing: 0.06em; gap: 8px; }
  .round-info-item { white-space: nowrap; }
  .round-info-item strong { color: var(--gold2); }

  /* ── BLOCK ── */
  .block-wrapper { flex: 1; overflow-x: auto; overflow-y: auto; padding: 16px 10px 32px; -webkit-overflow-scrolling: touch; }
  .block-outer { display: inline-block; position: relative; background: var(--paper); border: 3px solid var(--ink); box-shadow: 4px 4px 0 rgba(0,0,0,0.6), 0 0 40px rgba(201,148,58,0.12); transform: rotate(-0.3deg); transform-origin: top left; }
  .block-header-row { display: flex; }
  .block-corner { width: var(--row-label-w); flex-shrink: 0; background: var(--ink); }
  .block-trump-corner { width: var(--trump-col-w); flex-shrink: 0; background: var(--ink); display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 0.55rem; color: rgba(245,240,232,0.4); writing-mode: vertical-rl; padding: 4px 0; }
  .block-player-header { width: var(--cell-w); flex-shrink: 0; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--ink); color: var(--paper); font-family: 'Cinzel', serif; font-size: 0.72rem; font-weight: 700; border-left: 1.5px solid rgba(245,240,232,0.2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; position: relative; }
  .block-player-header.winner { color: var(--gold2); text-shadow: 0 0 8px rgba(201,148,58,0.5); }

  .block-row { display: flex; }
  .block-row-label { width: var(--row-label-w); flex-shrink: 0; height: var(--cell-h); display: flex; align-items: center; justify-content: center; background: var(--ink); color: var(--paper); font-family: 'Cinzel', serif; font-size: 0.75rem; font-weight: 700; border-top: 1.5px solid rgba(245,240,232,0.18); cursor: pointer; user-select: none; }
  .block-row-label.current { background: #1a3a6b; color: #7ab0ff; }
  .block-cell { width: var(--cell-w); flex-shrink: 0; height: var(--cell-h); border-left: 1px solid var(--line); border-top: 1px solid var(--line); position: relative; background: var(--paper); }
  .block-cell.inactive { background: var(--ink); }
  .block-cell.correct { background: rgba(26,92,26,0.12); }
  .block-cell.wrong { background: rgba(139,26,26,0.1); }
  .block-cell.current-round { background: rgba(26,58,107,0.1); }
  .cell-inner { display: flex; flex-direction: column; align-items: stretch; height: 100%; padding: 1px; }
  .cell-row { display: flex; align-items: center; flex: 1; gap: 1px; }
  .cell-label { font-size: 0.55rem; color: rgba(26,16,8,0.45); font-family: 'Cinzel', serif; width: 14px; text-align: center; flex-shrink: 0; }
  .cell-input { flex: 1; border: none; background: transparent; font-family: 'Crimson Text', serif; font-size: 0.88rem; color: var(--ink); text-align: center; padding: 0; min-width: 0; -webkit-tap-highlight-color: transparent; }
  .cell-input:focus { outline: none; background: rgba(201,148,58,0.1); border-radius: 2px; }
  .cell-divider { height: 1px; background: var(--line); opacity: 0.4; margin: 0 2px; }
  .cell-pts { font-family: 'Cinzel', serif; font-size: 0.6rem; font-weight: 700; position: absolute; bottom: 1px; right: 3px; line-height: 1; }
  .cell-pts.pos { color: var(--green); }
  .cell-pts.neg { color: var(--red); }

  /* Trump column */
  .trump-cell { width: var(--trump-col-w); flex-shrink: 0; height: var(--cell-h); border-top: 1px solid rgba(26,16,8,0.3); border-left: 2px solid rgba(26,16,8,0.4); display: flex; align-items: center; justify-content: center; cursor: pointer; background: rgba(245,240,232,0.95); -webkit-tap-highlight-color: transparent; }
  .trump-cell.inactive { background: var(--ink); cursor: default; }
  .trump-cell:not(.inactive):hover { background: rgba(201,148,58,0.15); }
  .trump-empty { font-size: 0.5rem; color: rgba(26,16,8,0.25); font-family: 'Cinzel', serif; }
  .trump-picker { position: fixed; z-index: 200; background: linear-gradient(160deg, #1e1608, #0f0d08); border: 1.5px solid var(--gold); border-radius: 6px; padding: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); display: flex; flex-wrap: wrap; gap: 6px; max-width: 220px; }
  .trump-picker-btn { width: 46px; height: 46px; border-radius: 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; -webkit-tap-highlight-color: transparent; background: rgba(245,240,232,0.04); }
  .trump-picker-btn.active { outline: 2px solid #fff; }
  .trump-picker-label { font-size: 0.45rem; color: rgba(245,240,232,0.5); font-family: 'Cinzel', serif; }
  .trump-picker-none { width: 100%; font-family: 'Cinzel', serif; font-size: 0.65rem; color: rgba(245,240,232,0.4); background: none; border: none; cursor: pointer; padding: 4px 0; text-align: center; }

  /* Staircase */
  .stair-label-row { display: flex; }
  .stair-label-cell { flex-shrink: 0; height: var(--cell-h); background: var(--ink); display: flex; align-items: center; padding-left: 6px; }
  .stair-label-text { font-family: 'Cinzel', serif; font-size: 0.62rem; color: rgba(245,240,232,0.55); white-space: nowrap; }
  .totals-row { display: flex; border-top: 2px solid var(--ink); }
  .totals-label { width: var(--row-label-w); flex-shrink: 0; height: 36px; background: var(--ink); display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 0.6rem; color: var(--paper); }
  .totals-trump { width: var(--trump-col-w); flex-shrink: 0; height: 36px; background: var(--ink); border-left: 2px solid rgba(245,240,232,0.1); }
  .totals-cell { width: var(--cell-w); flex-shrink: 0; height: 36px; border-left: 1px solid var(--line); display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 0.8rem; font-weight: 700; color: var(--ink); }
  .totals-cell.winner-col { color: var(--gold); background: rgba(201,148,58,0.08); }
  .block-logo-bar { background: var(--ink); display: flex; align-items: center; justify-content: center; gap: 10px; padding: 8px 16px; border-top: 1.5px solid rgba(245,240,232,0.1); }
  .block-logo-wizard { font-family: 'Cinzel', serif; font-size: 0.8rem; font-weight: 900; color: rgba(201,148,58,0.5); letter-spacing: 0.08em; }
  .block-logo-title { font-family: 'Cinzel', serif; font-size: 0.65rem; color: rgba(245,240,232,0.4); letter-spacing: 0.12em; text-transform: uppercase; }

  /* ── STATS ── */
  .stats-screen { min-height: 100vh; display: flex; flex-direction: column; background: transparent; position: relative; z-index: 1; }
  .stats-body { flex: 1; padding: 16px 14px 40px; overflow-y: auto; background: rgba(0,0,0,0.35); backdrop-filter: blur(2px); }
  .stats-title { font-family: 'Cinzel', serif; font-size: 1.1rem; font-weight: 900; color: var(--gold2); text-align: center; letter-spacing: 0.1em; margin-bottom: 4px; }
  .stats-subtitle { font-family: 'Cinzel', serif; font-size: 0.7rem; color: rgba(201,148,58,0.5); text-align: center; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 20px; }
  .winner-banner { background: linear-gradient(135deg, rgba(201,148,58,0.15), rgba(201,148,58,0.05)); border: 1.5px solid var(--gold); border-radius: 6px; padding: 14px 18px; text-align: center; margin-bottom: 20px; }
  .winner-crown { font-size: 1.6rem; display: block; margin-bottom: 4px; }
  .winner-name { font-family: 'Cinzel', serif; font-size: 1.1rem; font-weight: 900; color: var(--gold2); }
  .winner-score { font-family: 'Cinzel', serif; font-size: 0.8rem; color: var(--gold); margin-top: 2px; }
  .stat-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
  .stat-card { background: rgba(245,240,232,0.03); border: 1px solid rgba(201,148,58,0.2); border-radius: 5px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
  .stat-card.is-winner { border-color: var(--gold); background: rgba(201,148,58,0.06); }
  .stat-rank { font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 900; color: rgba(201,148,58,0.4); width: 24px; flex-shrink: 0; text-align: center; }
  .stat-info { flex: 1; min-width: 0; }
  .stat-player-name { font-family: 'Cinzel', serif; font-size: 0.85rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat-row { display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
  .stat-item { font-size: 0.75rem; color: rgba(245,240,232,0.55); }
  .stat-item strong { color: var(--paper); font-weight: 600; }
  .stat-score { font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 900; color: var(--gold2); flex-shrink: 0; }
  .hit-bar-wrap { margin-top: 5px; }
  .hit-bar-track { height: 5px; background: rgba(245,240,232,0.08); border-radius: 3px; overflow: hidden; }
  .hit-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #1a5c1a, #44ff66); transition: width 0.8s ease; }
  .hit-bar-label { font-size: 0.65rem; color: rgba(245,240,232,0.4); margin-top: 2px; }
  .chart-section { margin-bottom: 20px; }
  .chart-heading { font-family: 'Cinzel', serif; font-size: 0.72rem; letter-spacing: 0.12em; color: var(--gold); opacity: 0.7; text-transform: uppercase; margin-bottom: 10px; }
  .chart-box { background: rgba(245,240,232,0.02); border: 1px solid rgba(201,148,58,0.15); border-radius: 5px; padding: 12px 8px 8px; }
  .chart-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px; padding: 0 4px; }
  .chart-legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: rgba(245,240,232,0.7); font-family: 'Cinzel', serif; }
  .chart-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .pie-section { margin-bottom: 20px; }
  .pie-wrap { display: flex; align-items: center; gap: 20px; padding: 12px; background: rgba(245,240,232,0.02); border: 1px solid rgba(201,148,58,0.15); border-radius: 5px; flex-wrap: wrap; }
  .pie-legend { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 120px; }
  .pie-legend-item { display: flex; align-items: center; gap: 7px; font-size: 0.75rem; color: rgba(245,240,232,0.7); }
  .pie-legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  .pie-legend-count { margin-left: auto; font-family: 'Cinzel', serif; font-size: 0.72rem; color: var(--gold); }

  /* ── PROFILES ── */
  .profiles-screen { min-height: 100vh; display: flex; flex-direction: column; background: transparent; position: relative; z-index: 1; }
  .profiles-body { flex: 1; padding: 16px 14px 40px; overflow-y: auto; background: rgba(0,0,0,0.35); backdrop-filter: blur(2px); }
  .profile-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
  .profile-card { background: rgba(245,240,232,0.03); border: 1px solid rgba(201,148,58,0.2); border-radius: 5px; padding: 14px; cursor: pointer; transition: background 0.15s; }
  .profile-card:hover { background: rgba(201,148,58,0.07); }
  .profile-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .profile-card-name { font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 700; color: var(--gold2); }
  .profile-card-del { background: none; border: none; color: rgba(139,26,26,0.6); font-size: 1rem; cursor: pointer; padding: 2px 6px; }
  .profile-stats-row { display: flex; gap: 14px; flex-wrap: wrap; }
  .profile-stat { font-size: 0.75rem; color: rgba(245,240,232,0.55); }
  .profile-stat strong { color: var(--paper); }
  .achievements-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 14px; }
  .achievement { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(201,148,58,0.15); background: rgba(245,240,232,0.02); }
  .achievement.unlocked { border-color: var(--gold); background: rgba(201,148,58,0.08); }
  .achievement.locked { opacity: 0.35; filter: grayscale(1); }
  .achievement-icon { font-size: 1.2rem; flex-shrink: 0; }
  .achievement-info { min-width: 0; }
  .achievement-label { font-family: 'Cinzel', serif; font-size: 0.65rem; color: var(--gold2); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .achievement-desc { font-size: 0.62rem; color: rgba(245,240,232,0.4); margin-top: 1px; line-height: 1.3; }

  /* ── CONFIRM / TOAST ── */
  .confirm-box { background: linear-gradient(160deg, #1a1408, #0f0d08); border: 1.5px solid var(--red); border-radius: 6px; padding: 24px; width: 100%; max-width: 340px; text-align: center; }
  .confirm-box p { font-size: 1rem; color: var(--paper); margin-bottom: 20px; line-height: 1.5; }
  .confirm-actions { display: flex; gap: 10px; justify-content: center; }
  .btn-danger { padding: 10px 22px; background: var(--red); border: none; border-radius: 3px; color: var(--paper); font-family: 'Cinzel', serif; font-size: 0.85rem; font-weight: 700; cursor: pointer; }
  .btn-cancel { padding: 10px 22px; background: transparent; border: 1px solid rgba(245,240,232,0.25); border-radius: 3px; color: var(--paper); font-family: 'Cinzel', serif; font-size: 0.85rem; cursor: pointer; }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: rgba(26,16,8,0.95); border: 1px solid var(--gold); color: var(--gold2); font-family: 'Cinzel', serif; font-size: 0.8rem; padding: 10px 22px; border-radius: 4px; box-shadow: 0 0 20px rgba(201,148,58,0.3); z-index: 300; letter-spacing: 0.08em; pointer-events: none; animation: fadeInUp 0.3s ease; }
  @keyframes fadeInUp { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

  /* ── ROUND MODAL ── */
  .round-modal { background: linear-gradient(180deg, #1a1408 0%, #0f0d08 100%); border-top: 2px solid var(--gold); border-radius: 16px 16px 0 0; width: 100%; max-width: 480px; margin: 0 auto; padding-bottom: env(safe-area-inset-bottom, 16px); }
  .round-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; border-bottom: 1px solid rgba(201,148,58,0.2); }
  .round-modal-title { font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 900; color: var(--gold2); letter-spacing: 0.1em; }
  .round-modal-close { background: none; border: 1px solid rgba(201,148,58,0.3); color: var(--gold); font-family: 'Cinzel', serif; font-size: 0.65rem; padding: 5px 10px; border-radius: 3px; cursor: pointer; letter-spacing: 0.06em; }
  .round-modal-players { display: flex; flex-direction: column; gap: 0; padding: 6px 12px; }
  .round-modal-player { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 4px; transition: background 0.15s; }
  .round-modal-player.rmp-active { background: rgba(201,148,58,0.08); border: 1px solid rgba(201,148,58,0.25); }
  .round-modal-player:not(.rmp-active) { border: 1px solid transparent; }
  .rmp-name { font-family: 'Cinzel', serif; font-size: 0.78rem; color: var(--paper); font-weight: 700; width: 80px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rmp-fields { display: flex; align-items: center; gap: 6px; flex: 1; }
  .rmp-field { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(201,148,58,0.15); background: rgba(245,240,232,0.04); cursor: pointer; min-width: 42px; transition: border-color 0.15s, background 0.15s; }
  .rmp-field.rmp-field-active { border-color: var(--gold); background: rgba(201,148,58,0.15); }
  .rmp-field-label { font-family: 'Cinzel', serif; font-size: 0.5rem; color: rgba(245,240,232,0.4); letter-spacing: 0.08em; }
  .rmp-field-val { font-family: 'Cinzel', serif; font-size: 0.9rem; font-weight: 700; color: var(--paper); }
  .rmp-pts { font-family: 'Cinzel', serif; font-size: 0.8rem; font-weight: 700; min-width: 36px; text-align: center; }
  .rmp-pts-pos { color: #1a5c1a; }
  .rmp-pts-neg { color: var(--red); }
  .rmp-active-label { font-family: 'Cinzel', serif; font-size: 0.68rem; color: var(--gold); letter-spacing: 0.1em; text-align: center; padding: 5px 0 2px; opacity: 0.75; }
  .rmp-next-btn { display: block; padding: 10px 0; background: linear-gradient(135deg, #1e1608, #2d2010); border: 1.5px solid var(--gold); border-radius: 4px; color: var(--gold2); font-family: 'Cinzel', serif; font-size: 0.82rem; font-weight: 700; cursor: pointer; letter-spacing: 0.08em; margin: 0 16px 10px; width: calc(100% - 32px); }

  /* ── TRUMP IN MODAL ── */
  .rmp-trump-row { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-top: 1px solid rgba(201,148,58,0.12); border-bottom: 1px solid rgba(201,148,58,0.12); }
  .rmp-trump-label { font-family: 'Cinzel', serif; font-size: 0.62rem; color: rgba(201,148,58,0.5); letter-spacing: 0.08em; flex-shrink: 0; }
  .rmp-trump-btn { width: 28px; height: 28px; border-radius: 4px; border: 2px solid transparent; cursor: pointer; transition: border-color 0.15s, transform 0.1s; flex-shrink: 0; -webkit-tap-highlight-color: transparent; }
  .rmp-trump-btn.active { border-color: #fff; transform: scale(1.15); }
  .rmp-trump-none { width: 28px; height: 28px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: #333; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #888; font-size: 0.8rem; font-weight: 700; flex-shrink: 0; -webkit-tap-highlight-color: transparent; }
  .rmp-trump-none.active { border-color: #fff; transform: scale(1.15); }

  /* ── NUMPAD ── */
  .numpad { padding: 4px 12px 0; }
  .numpad-display { font-family: 'Cinzel', serif; font-size: 1.5rem; font-weight: 900; color: var(--gold2); text-align: center; padding: 4px 0 6px; letter-spacing: 0.1em; border-bottom: 1px solid rgba(201,148,58,0.2); margin-bottom: 6px; min-height: 40px; }
  .numpad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .numpad-key { padding: 10px 0; background: rgba(245,240,232,0.05); border: 1px solid rgba(201,148,58,0.2); border-radius: 6px; color: var(--paper); font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 700; cursor: pointer; text-align: center; transition: background 0.12s; -webkit-tap-highlight-color: transparent; }
  .numpad-key:active { background: rgba(201,148,58,0.2); }
  .numpad-ok { background: rgba(201,148,58,0.15); border-color: var(--gold); color: var(--gold2); }
  .numpad-ok:active { background: rgba(201,148,58,0.3); }
  .numpad-del { color: var(--gold); }

  .block-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
  .block-wrapper::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
  .block-wrapper::-webkit-scrollbar-thumb { background: rgba(201,148,58,0.3); border-radius: 3px; }

  @media (max-width: 400px) {
    :root { --cell-w: 62px; --cell-h: 44px; --row-label-w: 34px; --trump-col-w: 30px; }
  }
`;

// ─── Small Components ─────────────────────────────────────────────────────────

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="overlay">
      <div className="confirm-box">
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn-cancel" onClick={onCancel}>Abbrechen</button>
          <button className="btn-danger" onClick={onConfirm}>Ja, sicher</button>
        </div>
      </div>
    </div>
  );
}

function WizardSymbols() {
  return (
    <div className="wizard-symbols">
      <svg className="wsym wsym-sword" viewBox="0 0 40 80" fill="none">
        <defs><filter id="gs"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <g filter="url(#gs)" stroke="#7ef0ff" strokeLinecap="round" strokeLinejoin="round">
          <line x1="20" y1="6" x2="20" y2="62" strokeWidth="3"/>
          <line x1="7" y1="27" x2="33" y2="27" strokeWidth="2.5"/>
          <ellipse cx="20" cy="67" rx="5" ry="6" strokeWidth="2" fill="none"/>
          <polygon points="20,4 15,20 25,20" fill="#7ef0ff" opacity="0.8" stroke="none"/>
        </g>
      </svg>
      <div className="wsym-row">
        <svg className="wsym wsym-chalice" viewBox="0 0 50 70" fill="none">
          <defs><filter id="gc"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g filter="url(#gc)" stroke="#44ff66" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 10 Q8 32 25 40 Q42 32 40 10 Z" fill="none"/>
            <line x1="25" y1="40" x2="25" y2="58"/><line x1="13" y1="58" x2="37" y2="58"/>
            <circle cx="25" cy="25" r="6" fill="#44ff66" opacity="0.2" strokeWidth="1.5"/>
          </g>
        </svg>
        <svg className="wsym wsym-coin" viewBox="0 0 50 70" fill="none">
          <defs><filter id="gy"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g filter="url(#gy)" stroke="#ffcc00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="25" cy="30" r="19" fill="none"/>
            <circle cx="25" cy="30" r="12" fill="#ffcc00" opacity="0.15" strokeWidth="1.5"/>
            <text x="25" y="35" textAnchor="middle" fill="#ffcc00" fontSize="14" fontWeight="bold" stroke="none" opacity="0.8">✦</text>
          </g>
        </svg>
        <svg className="wsym wsym-trident" viewBox="0 0 50 80" fill="none">
          <defs><filter id="gr"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g filter="url(#gr)" stroke="#ff5522" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="25" y1="16" x2="25" y2="70"/>
            <line x1="12" y1="16" x2="12" y2="38"/><line x1="38" y1="16" x2="38" y2="38"/>
            <path d="M12 38 Q12 48 25 48 Q38 48 38 38"/>
            <polygon points="25,4 22,18 28,18" fill="#ff5522" opacity="0.85" stroke="none"/>
            <polygon points="12,5 9,18 15,18" fill="#ff5522" opacity="0.85" stroke="none"/>
            <polygon points="38,5 35,18 41,18" fill="#ff5522" opacity="0.85" stroke="none"/>
          </g>
        </svg>
      </div>
    </div>
  );
}

// ─── Trump Picker ─────────────────────────────────────────────────────────────

function TrumpPicker({ current, onSelect, anchorRef }) {
  const style = { top: 60, left: 10 };
  if (anchorRef?.current) {
    const r = anchorRef.current.getBoundingClientRect();
    style.top = r.bottom + 6;
    style.left = Math.min(r.left, window.innerWidth - 240);
  }
  return (
    <div className="trump-picker" style={{ ...style, position: "fixed" }}>
      {TRUMP_SUITS.map(s => {
        const isActive = current === s.key;
        return (
          <button key={s.key} className={`trump-picker-btn${isActive ? " active" : ""}`} onClick={() => onSelect(s.key)}>
            <div style={{ width: 28, height: 28, borderRadius: 5, background: s.bg, boxShadow: isActive ? `0 0 10px ${s.bg}` : "0 1px 3px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "0.9rem", border: s.key === "none" ? "1px solid rgba(255,255,255,0.2)" : "none" }}>
              {s.key === "none" ? "—" : ""}
            </div>
            <span className="trump-picker-label" style={{ color: s.color, fontWeight: 700 }}>{s.name}</span>
          </button>
        );
      })}
      <button className="trump-picker-none" onClick={() => onSelect(null)}>✕ löschen</button>
    </div>
  );
}

// ─── Block Cell ───────────────────────────────────────────────────────────────

const BlockCell = ({ data, onChange, isActive, isCurrent }) => {
  if (!isActive) return <div className="block-cell inactive" />;
  const pts = calcPoints(data.announced, data.tricks);
  const correct = pts !== null && parseInt(data.announced, 10) === parseInt(data.tricks, 10);
  const wrong = pts !== null && !correct;
  let cls = "block-cell" + (correct ? " correct" : wrong ? " wrong" : isCurrent ? " current-round" : "");
  return (
    <div className={cls}>
      <div className="cell-inner">
        <div className="cell-row">
          <span className="cell-label">A</span>
          <input className="cell-input" type="number" min="0" inputMode="numeric" value={data.announced} onChange={e => onChange({ ...data, announced: e.target.value })} />
        </div>
        <div className="cell-divider" />
        <div className="cell-row">
          <span className="cell-label">S</span>
          <input className="cell-input" type="number" min="0" inputMode="numeric" value={data.tricks} onChange={e => onChange({ ...data, tricks: e.target.value })} />
        </div>
      </div>
      {pts !== null && <div className={`cell-pts ${pts >= 0 ? "pos" : "neg"}`}>{pts > 0 ? "+" : ""}{pts}</div>}
    </div>
  );
};

const CumulativeCell = ({ value, isActive }) => (
  <div style={{ width: "var(--cell-w)", flexShrink: 0, height: 22, borderLeft: "1px solid rgba(26,16,8,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel',serif", fontSize: "0.7rem", fontWeight: 700, color: !isActive ? "transparent" : value === null ? "rgba(26,16,8,0.2)" : value >= 0 ? "var(--green)" : "var(--red)", background: isActive ? "rgba(230,220,200,0.7)" : "var(--ink)", borderTop: "1px solid rgba(26,16,8,0.18)" }}>
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
  const keys = ["1","2","3","4","5","6","7","8","9","DEL","0","OK"];
  return (
    <div className="numpad">
      <div className="numpad-display">{value === "" ? "—" : value}</div>
      <div className="numpad-grid">
        {keys.map(k => (
          <button key={k} className={`numpad-key${k==="OK"?" numpad-ok":k==="DEL"?" numpad-del":""}`} onClick={() => handleKey(k)}>
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
    <div className="overlay" style={{ alignItems: "flex-end", padding: 0, background: "rgba(0,0,0,0.75)" }}>
      <div className="round-modal">

        {/* Header */}
        <div className="round-modal-header">
          <div className="round-modal-title">Runde {round}</div>
          <button className="round-modal-close" onClick={onClose}>Schliessen</button>
        </div>

        {/* Dealer + First announcer info */}
        <div style={{ display:"flex", gap:0, borderBottom:"1px solid rgba(201,148,58,0.12)" }}>
          <div style={{ flex:1, padding:"6px 14px", borderRight:"1px solid rgba(201,148,58,0.12)" }}>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:"0.55rem", color:"rgba(201,148,58,0.45)", letterSpacing:"0.08em", marginBottom:2 }}>AUSTEILER</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:"0.8rem", color:"var(--paper)", fontWeight:700 }}>
              {players[(((game.firstPlayer?.[round] ?? 0) - 1) + playerCount) % playerCount]}
            </div>
          </div>
          <div style={{ flex:1, padding:"6px 14px" }}>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:"0.55rem", color:"rgba(201,148,58,0.45)", letterSpacing:"0.08em", marginBottom:2 }}>ERSTER ANSAGER</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:"0.8rem", color:"var(--gold2)", fontWeight:700 }}>
              {players[game.firstPlayer?.[round] ?? 0]}
            </div>
          </div>
        </div>

        {/* Trump selector */}
        <div className="rmp-trump-row">
          <span className="rmp-trump-label">Trumpf:</span>
          {TRUMP_SUITS.map(s => (
            s.key === "none"
              ? <button key={s.key} className={`rmp-trump-none${trumpKey === s.key ? " active" : ""}`} onClick={() => onSetTrump(round, s.key)} title={s.name}>—</button>
              : <button key={s.key} className={`rmp-trump-btn${trumpKey === s.key ? " active" : ""}`} style={{ background: s.bg }} onClick={() => onSetTrump(round, s.key)} title={s.name} />
          ))}
          {trumpKey && <button onClick={() => onSetTrump(round, null)} style={{ background:"none", border:"none", color:"rgba(245,240,232,0.3)", cursor:"pointer", fontSize:"0.75rem", marginLeft:2 }}>✕</button>}
        </div>

        {/* Player list */}
        <div className="round-modal-players">
          {players.map((name, p) => {
            const data = grid[round]?.[p] || { announced:"", tricks:"" };
            const pts = calcPoints(data.announced, data.tricks);
            const correct = pts !== null && parseInt(data.announced,10) === parseInt(data.tricks,10);
            const wrong = pts !== null && !correct;
            const isFirst = game.firstPlayer?.[round] === p;
            const isActivePlayer = active.playerIdx === p;
            return (
              <div key={p} className={`round-modal-player${isActivePlayer ? " rmp-active" : ""}`}>
                <div className="rmp-name">
{name}
                </div>
                <div className="rmp-fields">
                  <div className={`rmp-field${isActivePlayer && active.field==="announced" ? " rmp-field-active" : ""}`} onClick={() => setActive({ playerIdx:p, field:"announced" })}>
                    <div className="rmp-field-label">A</div>
                    <div className="rmp-field-val">{data.announced===""?"—":data.announced}</div>
                  </div>
                  <div className={`rmp-field${isActivePlayer && active.field==="tricks" ? " rmp-field-active" : ""}`} onClick={() => setActive({ playerIdx:p, field:"tricks" })}>
                    <div className="rmp-field-label">S</div>
                    <div className="rmp-field-val">{data.tricks===""?"—":data.tricks}</div>
                  </div>
                  <div className={`rmp-pts${correct?" rmp-pts-pos":wrong?" rmp-pts-neg":""}`}>
                    {pts !== null ? (pts > 0 ? `+${pts}` : pts) : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active label */}
        <div className="rmp-active-label">
          {players[active.playerIdx]} — {active.field === "announced" ? "Ansage" : "Stiche"}
        </div>

        {/* Numpad */}
        <Numpad value={activeData[active.field]} onChange={handleChange} onOk={advance} />

        {/* Action buttons */}
        <div style={{ display:"flex", gap:10, padding:"10px 16px 0" }}>
          <button className="rmp-next-btn" onClick={advance} style={{ flex:1 }}>
            {isLast ? "Fertig" : "Weiter"}
          </button>
          <button className="rmp-next-btn" onClick={onClose} style={{ flex:1, background:"transparent", borderColor:"rgba(201,148,58,0.4)", color:"var(--gold)" }}>
            Runde beenden
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Wizard Block ─────────────────────────────────────────────────────────────

function WizardBlock({ game, onUpdateCell, currentRound, onSetFirstPlayer, onSetTrump, onOpenRound }) {
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
        {/* Header */}
        <div className="block-header-row">
          <div className="block-corner" />
          {players.map((name, p) => {
            const isFirst = game.firstPlayer?.[currentRound] === p;
            return (
              <div key={p} className={`block-player-header${p === winnerIdx && totals[p].sum > 0 ? " winner" : ""}`}>
                {name}

              </div>
            );
          })}
          <div className="block-trump-corner">Trumpf</div>
        </div>

        {/* Rows */}
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
                  <div className="block-row-label" style={{ background: "var(--ink)", color: "rgba(245,240,232,0.2)", fontSize: "0.55rem", cursor: "default" }}>—</div>
                  <div className="stair-label-cell" style={{ width: `calc(var(--cell-w) * ${playerCount} + var(--trump-col-w))` }}>
                    <span className="stair-label-text">▲ {l.players} Spieler</span>
                  </div>
                </div>
              ))}
              <div className="block-row">
                <div className={`block-row-label${isCur ? " current" : ""}`} onClick={() => active && onOpenRound(round)}>
                  {round}
                </div>
                {players.map((_, p) => (
                  <BlockCell key={p} data={grid[round]?.[p] || { announced: "", tricks: "" }} isActive={active} isCurrent={isCur && active} onChange={v => onUpdateCell(round, p, v)} />
                ))}
                <div ref={el => trumpBtnRefs.current[round] = el} className={`trump-cell${!active ? " inactive" : ""}`} onClick={() => active && setTrumpPickerRound(prev => prev === round ? null : round)}>
                  {active ? (
                    trumpSuit
                      ? <div style={{ width: 18, height: 18, borderRadius: 3, background: trumpSuit.bg, boxShadow: `0 0 6px ${trumpSuit.bg}99`, border: trumpSuit.key === "none" ? "1px solid rgba(255,255,255,0.3)" : "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.55rem", fontWeight: 900 }}>{trumpSuit.key === "none" ? "—" : ""}</div>
                      : <span className="trump-empty">+</span>
                  ) : null}
                </div>
              </div>
              <div style={{ display: "flex" }}>
                <div style={{ width: "var(--row-label-w)", flexShrink: 0, height: 22, background: active ? "rgba(26,16,8,0.75)" : "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel',serif", fontSize: "0.5rem", color: "rgba(245,240,232,0.35)", borderTop: "1px solid rgba(245,240,232,0.08)" }}>
                  {active ? "∑" : ""}
                </div>
                {players.map((_, p) => <CumulativeCell key={p} value={cumulative[p]} isActive={active} />)}
                <div style={{ width: "var(--trump-col-w)", flexShrink: 0, height: 22, background: active ? "rgba(230,220,200,0.5)" : "var(--ink)", borderLeft: "2px solid rgba(26,16,8,0.25)", borderTop: "1px solid rgba(26,16,8,0.15)" }} />
              </div>
            </div>
          );
        })}

        <div className="totals-row">
          <div className="totals-label">∑</div>
          {players.map((_, p) => (
            <div key={p} className={`totals-cell${p === winnerIdx && totals[p].sum > 0 ? " winner-col" : ""}`}>{totals[p].sum}</div>
          ))}
          <div className="totals-trump" />
        </div>
        <div className="block-logo-bar">
          <div><div className="block-logo-wizard">WIZARD</div><div className="block-logo-title">Der Block der Wahrheit</div></div>
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
    <svg width={W} height={H} style={{ display: "block", minWidth: W }}>
      {gridVals.map(v => (
        <g key={v}>
          <line x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)} stroke="rgba(245,240,232,0.07)" strokeWidth="1" />
          <text x={PAD.left - 4} y={yScale(v) + 4} textAnchor="end" fill="rgba(245,240,232,0.3)" fontSize="9" fontFamily="Cinzel,serif">{v}</text>
        </g>
      ))}
      {minVal < 0 && <line x1={PAD.left} y1={yScale(0)} x2={W - PAD.right} y2={yScale(0)} stroke="rgba(245,240,232,0.2)" strokeWidth="1" strokeDasharray="4,3" />}
      {Array.from({ length: maxRounds + 1 }, (_, i) => i).filter(i => i % (maxRounds > 12 ? 3 : 2) === 0).map(i => (
        <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fill="rgba(245,240,232,0.25)" fontSize="8" fontFamily="Cinzel,serif">{i}</text>
      ))}
      {stats.map((s, pi) => (
        <g key={pi}>
          <polyline points={s.roundPoints.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ")} fill="none" stroke={PLAYER_COLORS[pi % PLAYER_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
          {s.roundPoints.map((v, i) => i > 0 && <circle key={i} cx={xScale(i)} cy={yScale(v)} r="2.5" fill={PLAYER_COLORS[pi % PLAYER_COLORS.length]} opacity="0.8" />)}
        </g>
      ))}
    </svg>
  );
}

const TRUMP_PIE_COLORS = { red: "#e82020", green: "#22bb44", blue: "#2266dd", yellow: "#ddb800", none: "#555" };

function PieChart({ freq }) {
  const entries = TRUMP_SUITS.map(s => ({ ...s, count: freq[s.key] || 0 })).filter(e => e.count > 0);
  const total = entries.reduce((a, e) => a + e.count, 0);
  if (total === 0) return <p style={{ color: "rgba(245,240,232,0.3)", fontSize: "0.8rem", textAlign: "center", padding: "16px 0" }}>Noch keine Trumpffarben eingetragen.</p>;
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
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
        {slices.map(s => <path key={s.key} d={s.path} fill={TRUMP_PIE_COLORS[s.key]} opacity="0.88" />)}
        <circle cx={cx} cy={cy} r={24} fill="#0d0d0f" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="rgba(245,240,232,0.4)" fontSize="10" fontFamily="Cinzel,serif">{total}×</text>
      </svg>
      <div className="pie-legend">
        {slices.map(s => (
          <div key={s.key} className="pie-legend-item">
            <div className="pie-legend-dot" style={{ background: TRUMP_PIE_COLORS[s.key] }} />
            <span style={{ color: TRUMP_PIE_COLORS[s.key], fontWeight: 700, fontSize: "0.85rem" }}>■</span>
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
        <button className="header-btn" onClick={onBack}>Zurück</button>
        {onFinish && <button className="header-btn" style={{ borderColor: "rgba(201,148,58,0.6)", color: "var(--gold2)" }} onClick={onFinish}>Abschließen</button>}
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
                  <div className="hit-bar-track"><div className="hit-bar-fill" style={{ width: `${s.rate}%` }} /></div>
                  <div className="hit-bar-label">{s.rate}% Trefferquote</div>
                </div>
              </div>
              <div className="stat-score">{s.total}</div>
            </div>
          ))}
        </div>
        <div className="chart-section">
          <div className="chart-heading">📈 Punkteverlauf</div>
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
          <div className="chart-heading">🃏 Trumpffarben-Häufigkeit</div>
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
        <button className="header-btn" onClick={onBack}>Zurück</button>
        <button className="header-btn" style={{ borderColor: "rgba(139,26,26,0.6)", color: "#ff6666" }} onClick={onDelete}>Löschen</button>
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
        <div className="chart-heading" style={{ marginBottom: 10 }}>🏅 Abzeichen</div>
        <div className="achievements-grid">
          {achs.map(a => (
            <div key={a.id} className={`achievement${a.unlocked ? " unlocked" : " locked"}`}>
              <span className="achievement-icon">{a.icon}</span>
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
        <button className="header-btn" onClick={onBack}>Zurück</button>
      </div>
      <div className="profiles-body">
        <div className="stats-title" style={{ marginBottom: 4 }}>Profile</div>
        <div className="stats-subtitle">Langzeit-Statistiken & Abzeichen</div>
        <div className="field">
          <label>Neues Profil erstellen</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name eingeben…" onKeyDown={e => e.key === "Enter" && addProfile()} style={{ flex: 1, padding: "9px 11px", background: "rgba(245,240,232,0.06)", border: "1px solid rgba(201,148,58,0.35)", borderRadius: 3, color: "var(--paper)", fontFamily: "'Crimson Text',serif", fontSize: "1rem" }} />
            <button className="menu-btn" style={{ width: "auto", padding: "0 18px", margin: 0 }} onClick={addProfile}>+ Erstellen</button>
          </div>
        </div>
        {profiles.length === 0
          ? <div className="empty-state">Noch keine Profile vorhanden.</div>
          : (
            <div className="profile-cards">
              {profiles.map(p => {
                const achs = computeAchievements(p).filter(a => a.unlocked);
                return (
                  <div key={p.id} className="profile-card" onClick={() => setSelected(p.id)}>
                    <div className="profile-card-header">
                      <div className="profile-card-name">{p.name}</div>
                      <button className="profile-card-del" onClick={e => { e.stopPropagation(); setConfirm({ id: p.id, name: p.name }); }}>✕</button>
                    </div>
                    <div className="profile-stats-row">
                      <span className="profile-stat">Spiele: <strong>{p.gamesPlayed}</strong></span>
                      <span className="profile-stat">Siege: <strong>{p.wins}</strong></span>
                      <span className="profile-stat">Ø Quote: <strong>{p.avgRate}%</strong></span>
                    </div>
                    {achs.length > 0 && <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>{achs.map(a => <span key={a.id} title={a.label} style={{ fontSize: "1rem" }}>{a.icon}</span>)}</div>}
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
    <div className="overlay">
      <div className="modal">
        <div className="modal-title">Neues Spiel</div>
        <div className="field">
          <label>Spielname</label>
          <input value={gameName} onChange={e => setGameName(e.target.value)} />
        </div>
        <div className="field">
          <label>Anzahl Spieler</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[3, 4, 5, 6].map(n => (
              <button key={n} onClick={() => setPlayerCount(n)} style={{ flex: 1, padding: "10px 0", borderRadius: 4, cursor: "pointer", fontFamily: "'Cinzel',serif", fontSize: "0.85rem", fontWeight: 700, background: playerCount === n ? "rgba(201,148,58,0.2)" : "rgba(245,240,232,0.04)", border: playerCount === n ? "1.5px solid var(--gold)" : "1px solid rgba(201,148,58,0.25)", color: playerCount === n ? "var(--gold2)" : "rgba(245,240,232,0.5)" }}>
                {n}<div style={{ fontSize: "0.55rem", opacity: 0.6, marginTop: 2 }}>{maxRoundsForPlayers(n)}R</div>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Spieler</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            {Array.from({ length: playerCount }, (_, i) => {
              const slot = slots[i];
              const profile = slot.profileId ? profiles.find(p => p.id === slot.profileId) : null;
              const achs = profile ? computeAchievements(profile).filter(a => a.unlocked) : [];
              return (
                <div key={i} style={{ borderRadius: 5, border: profile ? "1.5px solid var(--gold)" : "1px solid rgba(201,148,58,0.2)", background: profile ? "rgba(201,148,58,0.07)" : "rgba(245,240,232,0.03)", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: profile ? 6 : 0 }}>
                    <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.7rem", color: "rgba(201,148,58,0.5)", flexShrink: 0 }}>{i + 1}.</span>
                    {profile ? (
                      <>
                        <span style={{ fontFamily: "'Cinzel',serif", fontSize: "0.9rem", color: "var(--gold2)", fontWeight: 700, flex: 1 }}>{profile.name}</span>
                        <button onClick={() => clearSlot(i)} style={{ background: "none", border: "none", color: "rgba(245,240,232,0.35)", cursor: "pointer", fontSize: "0.9rem", padding: "0 4px" }}>✕</button>
                      </>
                    ) : (
                      <input value={slot.customName} onChange={e => setCustomName(i, e.target.value)} placeholder="Name eingeben…" style={{ flex: 1, padding: "6px 10px", background: "rgba(245,240,232,0.05)", border: "1px solid rgba(201,148,58,0.2)", borderRadius: 3, color: "var(--paper)", fontFamily: "'Crimson Text',serif", fontSize: "0.95rem" }} />
                    )}
                  </div>
                  {profile && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: "0.72rem", color: "rgba(245,240,232,0.45)" }}>Siege: <strong style={{ color: "var(--paper)" }}>{profile.wins}</strong></span>
                      <span style={{ fontSize: "0.72rem", color: "rgba(245,240,232,0.45)" }}>Spiele: <strong style={{ color: "var(--paper)" }}>{profile.gamesPlayed}</strong></span>
                      <span style={{ fontSize: "0.72rem", color: "rgba(245,240,232,0.45)" }}>Ø Quote: <strong style={{ color: "var(--paper)" }}>{profile.avgRate}%</strong></span>
                      {achs.length > 0 && <span style={{ fontSize: "0.85rem" }}>{achs.slice(0, 4).map(a => a.icon).join(" ")}</span>}
                    </div>
                  )}
                  {!profile && profiles.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                      <span style={{ fontSize: "0.6rem", color: "rgba(201,148,58,0.4)", fontFamily: "'Cinzel',serif", width: "100%", marginBottom: 2 }}>PROFIL WÄHLEN</span>
                      {profiles.filter(p => !takenIds.includes(p.id)).map(p => (
                        <button key={p.id} onClick={() => selectProfile(i, p.id)} style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer", background: "rgba(201,148,58,0.08)", border: "1px solid rgba(201,148,58,0.3)", color: "var(--gold2)", fontFamily: "'Cinzel',serif", fontSize: "0.75rem", fontWeight: 700 }}>
                          {p.name}
                        </button>
                      ))}
                      {profiles.filter(p => !takenIds.includes(p.id)).length === 0 && (
                        <span style={{ fontSize: "0.7rem", color: "rgba(245,240,232,0.25)" }}>Alle Profile bereits vergeben</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <button className="menu-btn secondary" onClick={onCancel}>Abbrechen</button>
          <button className="menu-btn" onClick={handleStart}>Starten</button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Screen ──────────────────────────────────────────────────────────────

function MenuScreen({ onNewGame, onLoadGame, onOpenProfiles }) {
  const [showSetup, setShowSetup] = useState(false);
  const [games, setGames] = useState(loadGames);

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const updated = games.filter(g => g.id !== id);
    setGames(updated); saveGames(updated);
  };

  return (
    <div className="menu-screen">
      <div className="menu-title">Wizard</div>
      <div className="menu-subtitle">Score Tracker · Block der Wahrheit</div>
      <WizardSymbols />
      <button className="menu-btn" onClick={() => setShowSetup(true)}>Neues Spiel</button>
      <button className="menu-btn secondary" onClick={onOpenProfiles}>Spielerprofile</button>
      <div className="saved-list" style={{ marginTop: 20 }}>
        {games.length === 0
          ? <div className="empty-state">Noch keine Spiele gespeichert.</div>
          : <>
              <div className="saved-list-title">Gespeicherte Spiele</div>
              {games.slice().reverse().map(g => (
                <div className="saved-item" key={g.id} onClick={() => onLoadGame(g)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="saved-item-name">{g.name}</div>
                    <div className="saved-item-date">{new Date(g.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                    <div className="saved-item-meta">{g.playerCount} Spieler · Runde {g.currentRound}</div>
                    <div className="saved-item-players">{g.players?.join(" · ")}</div>
                  </div>
                  <button className="saved-item-del" onClick={e => handleDelete(g.id, e)}>✕</button>
                </div>
              ))}
            </>
        }
      </div>
      {showSetup && <SetupModal onStart={opts => { setShowSetup(false); onNewGame(opts); }} onCancel={() => setShowSetup(false)} />}
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

  const setFirstPlayer = useCallback((round) => {
    setGame(prev => { const cur = prev.firstPlayer?.[round] ?? (round - 1) % prev.playerCount; return { ...prev, firstPlayer: { ...prev.firstPlayer, [round]: (cur + 1) % prev.playerCount }, updatedAt: new Date().toISOString() }; });
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
        <button className="header-btn" onClick={saveGame}>Speichern</button>
        <button className="header-btn" onClick={() => setShowStats(true)}>📊</button>
        <button className="header-btn" onClick={() => setConfirm({ msg: "Alle Einträge zurücksetzen?", onConfirm: () => { setConfirm(null); setGame(prev => createEmptyGame({ name: prev.name, players: prev.players, playerCount: prev.playerCount, profileIds: prev.profileIds })); showToast("✓ Zurückgesetzt"); } })}>Reset</button>
        <button className="header-btn" onClick={() => setConfirm({ msg: "Spiel beenden? Vorher speichern!", onConfirm: () => { setConfirm(null); onExit(); } })}>✕ Ende</button>
      </div>
      <div className="round-info">
        <span className="round-info-item">Runde: <strong>{game.currentRound}/{maxR}</strong></span>
        <span className="round-info-item">{game.playerCount} Spieler</span>
        {maxScore > 0 && <span className="round-info-item">Führt: <strong>{leader}</strong> ({maxScore})</span>}
      </div>
      <div className="block-wrapper">
        <WizardBlock game={game} onUpdateCell={updateCell} currentRound={game.currentRound} onSetFirstPlayer={setFirstPlayer} onSetTrump={setTrump} onOpenRound={setRoundModal} />
      </div>
      {confirm && <ConfirmDialog message={confirm.msg} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      {roundModal !== null && <RoundModal game={game} round={roundModal} onUpdateCell={updateCell} onClose={() => setRoundModal(null)} onSetTrump={setTrump} />}
      <Toast msg={toast} />
    </div>
  );
}

// ─── Lava Background ─────────────────────────────────────────────────────────

function LavaBg() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "#0d0d0f" }}>
      {/* Lava ambient glow */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 30% at 15% 80%, rgba(180,40,0,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 25% at 85% 60%, rgba(220,80,0,0.12) 0%, transparent 60%), radial-gradient(ellipse 50% 20% at 50% 95%, rgba(200,60,0,0.2) 0%, transparent 60%), radial-gradient(ellipse 30% 15% at 70% 10%, rgba(160,30,0,0.1) 0%, transparent 60%)", animation: "ambientPulse 6s ease-in-out infinite alternate" }} />
      {/* SVG crack lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="lavaBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/></feMerge></filter>
          <filter id="lavaBlurStrong" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>
          <filter id="lavaBlurSoft" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="12"/></filter>
        </defs>
        {/* Crack 1 – top left */}
        <g className="crack-glow">
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurSoft)" d="M 60 0 L 95 55 L 80 90 L 120 145 L 100 200 L 145 270 L 130 330" stroke="#ff4400" strokeWidth="14" opacity="0.35"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurStrong)" d="M 60 0 L 95 55 L 80 90 L 120 145 L 100 200 L 145 270 L 130 330" stroke="#ff6600" strokeWidth="7" opacity="0.6"/>
          <path fill="none" strokeLinecap="round" d="M 60 0 L 95 55 L 80 90 L 120 145 L 100 200 L 145 270 L 130 330" stroke="#ffcc44" strokeWidth="1.5" opacity="0.95"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurStrong)" d="M 95 55 L 140 85 L 175 70" stroke="#ff5500" strokeWidth="5" opacity="0.5"/>
          <path fill="none" strokeLinecap="round" d="M 95 55 L 140 85 L 175 70" stroke="#ffdd55" strokeWidth="1.2" opacity="0.8"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 120 145 L 160 160 L 190 150 L 210 175" stroke="#ff4400" strokeWidth="4" opacity="0.45"/>
          <path fill="none" strokeLinecap="round" d="M 120 145 L 160 160 L 190 150 L 210 175" stroke="#ffbb33" strokeWidth="1" opacity="0.75"/>
        </g>
        {/* Crack 2 – top right */}
        <g className="crack-glow-2">
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurSoft)" d="M 820 0 L 790 60 L 840 110 L 810 170 L 860 240 L 830 300 L 870 380" stroke="#ff3300" strokeWidth="14" opacity="0.3"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurStrong)" d="M 820 0 L 790 60 L 840 110 L 810 170 L 860 240 L 830 300 L 870 380" stroke="#ff6622" strokeWidth="7" opacity="0.55"/>
          <path fill="none" strokeLinecap="round" d="M 820 0 L 790 60 L 840 110 L 810 170 L 860 240 L 830 300 L 870 380" stroke="#ffcc33" strokeWidth="1.5" opacity="0.9"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurStrong)" d="M 840 110 L 900 130 L 950 115" stroke="#ff5500" strokeWidth="5" opacity="0.5"/>
          <path fill="none" strokeLinecap="round" d="M 840 110 L 900 130 L 950 115" stroke="#ffdd44" strokeWidth="1.2" opacity="0.8"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 860 240 L 920 260 L 970 245 L 1000 265" stroke="#ff4400" strokeWidth="4" opacity="0.4"/>
          <path fill="none" strokeLinecap="round" d="M 860 240 L 920 260 L 970 245 L 1000 265" stroke="#ffbb22" strokeWidth="1" opacity="0.7"/>
        </g>
        {/* Crack 3 – bottom left */}
        <g className="crack-glow-3">
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurSoft)" d="M 0 500 L 55 470 L 90 490 L 140 450 L 200 470 L 260 440 L 310 460 L 370 430" stroke="#ff3300" strokeWidth="12" opacity="0.32"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurStrong)" d="M 0 500 L 55 470 L 90 490 L 140 450 L 200 470 L 260 440 L 310 460 L 370 430" stroke="#ff5500" strokeWidth="6" opacity="0.55"/>
          <path fill="none" strokeLinecap="round" d="M 0 500 L 55 470 L 90 490 L 140 450 L 200 470 L 260 440 L 310 460 L 370 430" stroke="#ffcc22" strokeWidth="1.4" opacity="0.88"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 140 450 L 155 510 L 140 560 L 160 620 L 145 700" stroke="#ff4400" strokeWidth="4" opacity="0.45"/>
          <path fill="none" strokeLinecap="round" d="M 140 450 L 155 510 L 140 560 L 160 620 L 145 700" stroke="#ffbb33" strokeWidth="1" opacity="0.75"/>
        </g>
        {/* Crack 4 – bottom right */}
        <g className="crack-glow-4">
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurSoft)" d="M 1000 480 L 940 500 L 900 480 L 850 510 L 800 490 L 740 520 L 690 500 L 640 530" stroke="#ff3300" strokeWidth="12" opacity="0.3"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurStrong)" d="M 1000 480 L 940 500 L 900 480 L 850 510 L 800 490 L 740 520 L 690 500 L 640 530" stroke="#ff5522" strokeWidth="6" opacity="0.52"/>
          <path fill="none" strokeLinecap="round" d="M 1000 480 L 940 500 L 900 480 L 850 510 L 800 490 L 740 520 L 690 500 L 640 530" stroke="#ffcc33" strokeWidth="1.4" opacity="0.88"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 850 510 L 855 570 L 840 620 L 855 700" stroke="#ff4400" strokeWidth="4" opacity="0.4"/>
          <path fill="none" strokeLinecap="round" d="M 850 510 L 855 570 L 840 620 L 855 700" stroke="#ffaa22" strokeWidth="1" opacity="0.72"/>
        </g>
        {/* Crack 5 – center diagonal */}
        <g className="crack-glow-5">
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurSoft)" d="M 380 0 L 400 70 L 380 130 L 410 200 L 390 270 L 420 340 L 400 410 L 430 480 L 410 560 L 440 640 L 420 700" stroke="#ff2200" strokeWidth="10" opacity="0.28"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlurStrong)" d="M 380 0 L 400 70 L 380 130 L 410 200 L 390 270 L 420 340 L 400 410 L 430 480 L 410 560 L 440 640 L 420 700" stroke="#ff5500" strokeWidth="5" opacity="0.48"/>
          <path fill="none" strokeLinecap="round" d="M 380 0 L 400 70 L 380 130 L 410 200 L 390 270 L 420 340 L 400 410 L 430 480 L 410 560 L 440 640 L 420 700" stroke="#ffcc33" strokeWidth="1.2" opacity="0.82"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 410 200 L 460 210 L 510 200 L 550 215" stroke="#ff4400" strokeWidth="3.5" opacity="0.4"/>
          <path fill="none" strokeLinecap="round" d="M 410 200 L 460 210 L 510 200 L 550 215" stroke="#ffbb22" strokeWidth="0.9" opacity="0.7"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 420 340 L 360 355 L 310 345" stroke="#ff4400" strokeWidth="3.5" opacity="0.4"/>
          <path fill="none" strokeLinecap="round" d="M 420 340 L 360 355 L 310 345" stroke="#ffbb22" strokeWidth="0.9" opacity="0.7"/>
        </g>
        {/* Small accent cracks */}
        <g opacity="0.6">
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 580 50 L 600 90 L 585 130 L 610 170" stroke="#ff5500" strokeWidth="3" opacity="0.45"/>
          <path fill="none" strokeLinecap="round" d="M 580 50 L 600 90 L 585 130 L 610 170" stroke="#ffcc33" strokeWidth="0.9" opacity="0.7"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 700 560 L 720 600 L 705 640 L 725 700" stroke="#ff4400" strokeWidth="3" opacity="0.4"/>
          <path fill="none" strokeLinecap="round" d="M 700 560 L 720 600 L 705 640 L 725 700" stroke="#ffaa22" strokeWidth="0.9" opacity="0.65"/>
          <path fill="none" strokeLinecap="round" filter="url(#lavaBlur)" d="M 220 20 L 235 60 L 215 95" stroke="#ff5500" strokeWidth="2.5" opacity="0.38"/>
          <path fill="none" strokeLinecap="round" d="M 220 20 L 235 60 L 215 95" stroke="#ffcc44" strokeWidth="0.8" opacity="0.65"/>
        </g>
      </svg>
      {/* Vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%)" }} />
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
      <LavaBg />
      {screen === "menu" && (
        <MenuScreen
          onNewGame={opts => { setActiveGame(createEmptyGame(opts)); setScreen("game"); }}
          onLoadGame={g => { setActiveGame(g); setScreen("game"); }}
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

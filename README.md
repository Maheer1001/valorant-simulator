# Valorant Tactical Simulation

A deterministic, seeded tactical simulator for 5v5 Valorant-style rounds. Draft two teams, buy and plan in a pre-round phase, then play the round live on an SVG map: pause, change speed, give orders and watch abilities resolve. Line of sight, smokes, ability charges and shots are all resolved by an engine with no UI code in it.

> Fan project. Not affiliated with or endorsed by Riot Games. The map ("Drill Hall") and the weapon ("Rifle A") are original stand-ins, not game assets.

## What works

- **Draft:** pick agents for attack and defence, up to five per team, one copy of each agent per team. Inspect kits and see which abilities are implemented and which are placeholders.
- **Composition coverage:** each team gets a report of what its abilities cover (smokes, entry, flank watch) and where the gaps are.
- **Two full agent kits:** Breach and Brimstone are fully playable (flash, concussions, smokes, molly, stim beacon, orbital strike, ult points and charges).
- **Pre-round:** a buy timer, ability purchases, routes per attacker, and casts queued at a time or at a waypoint. Press Go to start the round.
- **Live round:** pause and resume, speed control, a 1:40 round timer, multi-select, hotkeys, right-click moves, ability and path previews, a kill feed, and fog of war with a truth toggle.
- **Simulation:** fixed 50 ms steps over an event queue ordered by `(timeMs, sequence, agentId)`, with integer milliseconds and millimetres. Walls block movement and sight; smokes block sight until they expire.
- **Seeded randomness:** named RNG streams forked from the scenario seed. Each shot stores its hit chance and its draw separately, so the same seed always gives the same run.
- **Replays and scenarios:** download and reload a round's order log as a replay, and export and import scenarios as versioned JSON.

The defense is still a hold-position stub, and there is no spike yet. Both are on the roadmap.

Every rule and ability number is tagged with its source (patch notes, wiki, or assumed). The full list is in [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Stack

React 19, TypeScript, Vite, SVG rendering. Vitest with Testing Library for tests, and ESLint with `typescript-eslint` for linting. There's no backend.

## Prerequisites

- Node.js 20.19+ or 22.12+ (required by Vite 8; verified with Node 24) and npm.
- No API keys or environment variables are needed. Everything runs locally in the browser.

## Install

```bash
git clone https://github.com/Maheer1001/valorant-simulator.git
cd valorant-simulator
npm ci
```

## Run (dev)

```bash
npm run dev        # Vite dev server, open the printed http://localhost:5173 URL
```

## Build

```bash
npm run build      # production build to dist/
npm run preview    # serve the built dist/ locally
```

## Testing

**Prerequisites:** Node.js 20.19+ or 22.12+ and npm, then `npm ci` (see [Install](#install)). There are no environment variables, API keys or services to set up, and no browser is needed: component tests run in jsdom.

**1. Setup check (about 1 s).** Run this first after cloning:

```bash
npm run test:setup
```

It runs `tests/setup-check/` in plain Node and proves the pieces are hooked together:

| Check | What it proves |
| --- | --- |
| Toolchain | Node is a version Vite 8 supports, and every dependency in `package.json` is installed at a matching version (a failure tells you to run `npm ci`). |
| Data and map | `data/*.json` and `agent-reference.json` load, the Drill Hall map resolves with spawns in bounds, the playable agents are in the catalog, and a scenario survives JSON export and import. |
| Live-round engine | A short scripted 2v2 round (attackers walk into the defenders' room) runs headlessly to a valid result with one `round-ended` event and time-ordered events. The same seed gives the same events, and replaying the order log gives the same final world and result. |

**2. Full suite (about 15-20 s).** One command runs every test:

```bash
npm test
```

| Folder | What it covers |
| --- | --- |
| `tests/sim/` | Engine: clock, RNG, geometry and line of sight, combat, abilities, the live runner, pre-round plans, replays, plus golden and characterization tests against `tests/fixtures/`. |
| `tests/ui/` | React components and the host loop in jsdom, including DOM golden snapshots. |
| `tests/data/` | The agent reference and primitive-stage data files. |
| `tests/architecture*.test.ts` | `src/sim/` stays free of React and UI imports; registries stay consistent. |

Fixtures under `tests/fixtures/` are committed reference captures. Don't regenerate them to make a failing test pass: `h0-golden/` and `window-parity/` are frozen, and `characterization/` is only re-captured on purpose with `VALSIM_UPDATE_FIXTURES=1`.

**Other gates:**

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run check      # lint, typecheck, test and build in one go
```

## Layout

```text
src/
  sim/          engine: clock, rng, map geometry + line of sight, agents, abilities, combat, composition
  tactics/      decision contracts (filled in later milestones)
  learning/     learning-record contracts
  persistence/  scenario JSON (de)serialisation
  rules/        rulesets and source provenance
  ui/           React: board, draft, pre-round, live HUD and orders
tests/          unit tests + an architecture test that keeps sim/ free of React imports
```

## Roadmap

Every planned stage (the remaining agent kits, spike, weapons, economy, multi-round matches, an opponent, a planner and learning records), with how each will be built and what it depends on, is in [`docs/roadmap.md`](docs/roadmap.md). [`PROJECT_STATUS.md`](PROJECT_STATUS.md) has what's done and what's assumed.

// @vitest-environment node
/**
 * Setup check: proves a fresh clone is wired together end to end.
 *
 *   npm run test:setup
 *
 * It runs in the plain Node environment (no jsdom) so the engine part also
 * proves the simulation is headless. It does not read or write any fixture.
 * Each assertion carries a message that says what to fix when it fails.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { SHIPPED_CATALOG, getAgent } from "../../src/sim/agents/catalog.ts";
import {
  isLiveRound,
  issueOrders,
  openLiveRound,
  replayOrderLog,
  stepLive,
  truthLiveWorld,
  type LiveRound,
} from "../../src/sim/live-round.ts";
import { DRILL_HALL, getMap } from "../../src/sim/map/drill-hall.ts";
import { parseScenario, serializeScenario } from "../../src/persistence/scenario-file.ts";
import { defenseHoldDecide } from "../../src/tactics/defense-stub.ts";
import { createPlayableDrill } from "../../src/ui/scenario/playableDrill.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(relative: string): unknown {
  const file = path.join(ROOT, relative);
  expect(existsSync(file), `${relative} is missing. Is the clone complete?`).toBe(true);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${relative} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
}

function parseVersion(text: string): [number, number, number] {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) throw new Error(`cannot parse version "${text}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function atLeast(have: [number, number, number], want: [number, number, number]): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (have[i] !== want[i]) return have[i]! > want[i]!;
  }
  return true;
}

describe("setup check: toolchain", () => {
  it("runs on a Node version Vite 8 supports (20.19+ or 22.12+)", () => {
    const node = parseVersion(process.versions.node);
    const ok = node[0] === 20 ? atLeast(node, [20, 19, 0]) : node[0] === 22 ? atLeast(node, [22, 12, 0]) : node[0] > 22;
    expect(ok, `Node ${process.versions.node} is too old. Install Node 20.19+, 22.12+ or newer (verified with 24).`).toBe(
      true,
    );
  });

  it("has every package.json dependency installed at a matching version", () => {
    const pkg = readJson("package.json") as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(existsSync(path.join(ROOT, "package-lock.json")), "package-lock.json is missing; npm ci needs it.").toBe(true);
    const wanted = { ...pkg.dependencies, ...pkg.devDependencies };
    const problems: string[] = [];
    for (const [name, range] of Object.entries(wanted)) {
      const manifest = path.join(ROOT, "node_modules", name, "package.json");
      if (!existsSync(manifest)) {
        problems.push(`${name} is not installed`);
        continue;
      }
      const installed = (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
      // Every range in package.json is a caret range: same major, at least the minimum.
      const min = parseVersion(range);
      const have = parseVersion(installed);
      if (!range.startsWith("^") || have[0] !== min[0] || !atLeast(have, min)) {
        problems.push(`${name}@${installed} does not satisfy ${range}`);
      }
    }
    expect(problems, `Run "npm ci" to install the locked dependencies:\n  ${problems.join("\n  ")}`).toEqual([]);
  });
});

describe("setup check: data and map", () => {
  it("loads the data files the sim and tests read", () => {
    const primitives = readJson("data/ability-primitives.json");
    const stages = readJson("data/primitive-stages.json") as { stages?: unknown[] };
    const reference = readJson("agent-reference.json");
    expect(primitives, "data/ability-primitives.json is empty").toBeTruthy();
    expect(Array.isArray(stages.stages) && stages.stages.length > 0, "data/primitive-stages.json has no stages").toBe(
      true,
    );
    expect(reference, "agent-reference.json is empty").toBeTruthy();
  });

  it("resolves the Drill Hall map with spawns inside its bounds", () => {
    const map = getMap(DRILL_HALL.id);
    expect(map, `getMap("${DRILL_HALL.id}") returned null; the map registry is not wired.`).not.toBeNull();
    if (!map) return;
    expect(map.walls.length, "Drill Hall has no walls").toBeGreaterThan(0);
    for (const spawn of [...map.attackSpawns, ...map.defenseSpawns]) {
      const inside = spawn.xMm > 0 && spawn.xMm < map.widthMm && spawn.yMm > 0 && spawn.yMm < map.heightMm;
      expect(inside, `spawn ${spawn.xMm},${spawn.yMm} is outside the map`).toBe(true);
    }
  });

  it("has the playable agents in the shipped catalog", () => {
    for (const id of ["breach", "brimstone", "jett", "kayo"]) {
      expect(getAgent(SHIPPED_CATALOG, id), `agent "${id}" is missing from SHIPPED_CATALOG`).not.toBeNull();
    }
  });

  it("round-trips the playable scenario through the scenario file format", () => {
    const scenario = createPlayableDrill(1);
    expect(parseScenario(serializeScenario(scenario)), "scenario JSON export/import changed the scenario").toEqual(
      scenario,
    );
  });
});

/** Script: both attackers walk through the doorway into the defenders' room. */
function playScriptedRound(seed: number): LiveRound {
  const opened = openLiveRound(createPlayableDrill(seed), undefined, undefined, { decide: defenseHoldDecide });
  if (!isLiveRound(opened)) throw new Error(`openLiveRound refused the playable drill: ${opened.message}`);
  const round = opened;
  const issued = issueOrders(round, "attack", [
    {
      kind: "move-route",
      instanceId: "breach-attack",
      waypoints: [
        { xMm: 7000, yMm: 6000 },
        { xMm: 12000, yMm: 6000 },
        { xMm: 15000, yMm: 2000 },
      ],
    },
    {
      kind: "move-route",
      instanceId: "brimstone-attack",
      waypoints: [
        { xMm: 7000, yMm: 6000 },
        { xMm: 12000, yMm: 6000 },
        { xMm: 15000, yMm: 10000 },
      ],
    },
  ]);
  if (!issued.ok) throw new Error(`scripted orders were rejected: ${issued.code}: ${issued.message}`);
  const maxSteps = STANDARD_RULESET.roundDurationMs / STANDARD_RULESET.simStepMs + 1;
  for (let step = 0; step < maxSteps && round.phase === "live"; step += 20) stepLive(round, 20);
  return round;
}

describe("setup check: live-round engine (headless)", () => {
  it("plays a short scripted round to a valid result", () => {
    const round = playScriptedRound(1);
    expect(round.phase, "the round never ended; stepLive is not reaching a result rule").toBe("ended");
    expect(round.world.timeMs, "the round ran past the round timer").toBeLessThanOrEqual(STANDARD_RULESET.roundDurationMs);

    const result = round.result;
    expect(["attack-eliminated", "defense-eliminated", "timeout"], `unexpected result ${JSON.stringify(result)}`).toContain(
      result?.kind,
    );

    const ended = round.events.filter((event) => event.type === "round-ended");
    expect(ended.length, "expected exactly one round-ended event").toBe(1);

    for (let i = 1; i < round.events.length; i += 1) {
      expect(round.events[i]!.timeMs, `event ${i} is earlier than event ${i - 1}`).toBeGreaterThanOrEqual(
        round.events[i - 1]!.timeMs,
      );
    }

    const accepted = round.orderLog.filter((entry) => entry.side === "attack" && entry.result === "accepted");
    expect(accepted.length, "the scripted attack orders were not logged as accepted").toBeGreaterThan(0);
  });

  it("is deterministic and replays from its order log", () => {
    const first = playScriptedRound(1);
    const second = playScriptedRound(1);
    expect(second.events, "same seed and orders gave different events; something reads unseeded state").toEqual(
      first.events,
    );

    const replayed = replayOrderLog(first.scenario, first.orderLog, first.world.timeMs);
    if (!isLiveRound(replayed)) throw new Error(`replayOrderLog failed: ${replayed.message}`);
    expect(truthLiveWorld(replayed), "replaying the order log did not reproduce the final world").toEqual(
      truthLiveWorld(first),
    );
    expect(replayed.result, "replaying the order log did not reproduce the result").toEqual(first.result);
  });
});

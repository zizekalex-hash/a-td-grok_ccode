import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyPendingRestore,
  backupFileName,
  collect,
  parseBackup,
  PENDING_KEY,
  stageRestore,
  summary,
  type Store,
} from "./backup.ts";

/** A stand-in for the device's storage. */
function memory(init: Record<string, string> = {}): Store & { all: () => Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    all: () => Object.fromEntries(m),
  };
}

describe("backup", () => {
  const phoneA = () =>
    memory({
      "azshara-signal-v1": '{"settings":{"textSize":30}}',
      "azshara-court-v1": '{"gold":500}',
      "azshara-reps-v1": '{"items":[{"id":"a","text":"xyz","total":200}]}',
      "azshara-cfg-boot": "1",
      "other-app": "not ours",
    });

  it("collects every save of this game, and nothing else", () => {
    const b = collect(phoneA(), 1234);
    assert.equal(b.app, "azshara-signal-defense");
    assert.equal(b.exportedAt, 1234);
    assert.deepEqual(Object.keys(b.keys).sort(), [
      "azshara-court-v1",
      "azshara-reps-v1",
      "azshara-signal-v1",
    ]);
    assert.equal(b.keys["azshara-court-v1"], '{"gold":500}', "exactly as stored");
    const s = summary(b);
    assert.deepEqual(s.what, [
      "Options, texts, skills and best scores",
      "Reps and their history",
      "The Court",
    ]);
    assert.ok(s.bytes > 50);
  });

  it("restores on another phone at the next start, replacing what was there", () => {
    const file = JSON.stringify(collect(phoneA(), 1234));
    const phoneB = memory({
      "azshara-court-v1": '{"gold":3}',
      "azshara-chess-v1": '{"best":2}',
      "azshara-cfg-boot": "1",
      "azshara-cfg-paused": "1",
      "other-app": "theirs",
    });
    const parsed = parseBackup(file);
    assert.ok(parsed.ok);
    stageRestore(phoneB, parsed.backup);
    assert.equal(
      phoneB.getItem("azshara-court-v1"),
      '{"gold":3}',
      "nothing changes until the start",
    );
    assert.equal(applyPendingRestore(phoneB), true);
    assert.deepEqual(phoneB.all(), {
      "azshara-cfg-boot": "1",
      "other-app": "theirs",
      "azshara-signal-v1": '{"settings":{"textSize":30}}',
      "azshara-court-v1": '{"gold":500}',
      "azshara-reps-v1": '{"items":[{"id":"a","text":"xyz","total":200}]}',
    });
    assert.equal(phoneB.getItem(PENDING_KEY), null);
    assert.equal(applyPendingRestore(phoneB), false, "only once");
  });

  it("turns away files that are not a backup of this game, in plain words", () => {
    const bad = (t: string) => {
      const r = parseBackup(t);
      return r.ok ? "" : r.error;
    };
    assert.match(bad("not json"), /not JSON/);
    assert.match(
      bad('{"app":"other","kind":"backup","version":1,"keys":{}}'),
      /not a backup of this game/,
    );
    assert.match(
      bad('{"app":"azshara-signal-defense","kind":"backup","version":99,"keys":{"azshara-x":"1"}}'),
      /newer version/,
    );
    assert.match(
      bad('{"app":"azshara-signal-defense","kind":"backup","version":1,"keys":{}}'),
      /empty/,
    );
    // Only this game's saves are restored, as text.
    const r = parseBackup(
      JSON.stringify({
        app: "azshara-signal-defense",
        kind: "backup",
        version: 1,
        keys: {
          "azshara-court-v1": "{}",
          "evil-key": "x",
          "azshara-cfg-boot": "1",
          "azshara-n": 5,
        },
      }),
    );
    assert.ok(r.ok && Object.keys(r.backup.keys).join() === "azshara-court-v1");
    // A broken pending restore is dropped, and the saves stay.
    const p = memory({ [PENDING_KEY]: "{broken", "azshara-court-v1": "{}" });
    assert.equal(applyPendingRestore(p), false);
    assert.deepEqual(p.all(), { "azshara-court-v1": "{}" });
  });

  it("names the file by its date", () => {
    assert.match(backupFileName(Date.UTC(2026, 10, 1, 12)), /^azshara-backup-2026-11-0[12]\.json$/);
  });
});

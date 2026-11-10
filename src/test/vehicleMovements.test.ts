import { describe, it, expect } from "vitest";
import {
  buildMovementMap, movementLabel, movementStateOf, movementsFor, standCount,
  type MovementRow,
} from "@/lib/vehicleMovements";

const NOW = new Date("2026-11-10T12:00:00Z").getTime();

const out = (over: Partial<MovementRow> = {}): MovementRow => ({
  id: "m-out", vehicle_id: "v1", direction: "out",
  person_name: "Musa Ibrahim", reason: "Customer inspection",
  moved_at: "2026-11-10T09:00:00Z", ...over,
});

const back = (over: Partial<MovementRow> = {}): MovementRow => ({
  id: "m-in", vehicle_id: "v1", direction: "in",
  person_name: "Musa Ibrahim", moved_at: "2026-11-10T11:00:00Z", ...over,
});

describe("buildMovementMap", () => {
  it("reads the latest movement, so a returned car is back on the stand", () => {
    const map = buildMovementMap([out(), back()], NOW);
    expect(map.get("v1")?.isOut).toBe(false);
  });

  it("leaves a car out when the sign-out is the latest movement", () => {
    const map = buildMovementMap([back({ moved_at: "2026-11-09T10:00:00Z" }), out()], NOW);
    const state = map.get("v1")!;
    expect(state.isOut).toBe(true);
    expect(state.person).toBe("Musa Ibrahim");
    expect(state.reason).toBe("Customer inspection");
    expect(state.since).toBe("2026-11-10T09:00:00Z");
  });

  it("is not confused by the order rows arrive in", () => {
    const chronological = buildMovementMap([out(), back()], NOW);
    const reversed = buildMovementMap([back(), out()], NOW);
    expect(chronological.get("v1")?.isOut).toBe(reversed.get("v1")?.isOut);
  });

  it("keeps vehicles separate", () => {
    const map = buildMovementMap([
      out({ id: "a", vehicle_id: "v1" }),
      out({ id: "b", vehicle_id: "v2" }),
      back({ id: "c", vehicle_id: "v2", moved_at: "2026-11-10T10:00:00Z" }),
    ], NOW);
    expect(map.get("v1")?.isOut).toBe(true);
    expect(map.get("v2")?.isOut).toBe(false);
  });

  it("falls back to created_at when moved_at is absent", () => {
    const map = buildMovementMap(
      [out({ moved_at: null, created_at: "2026-11-10T09:00:00Z" })],
      NOW
    );
    expect(map.get("v1")?.since).toBe("2026-11-10T09:00:00Z");
  });
});

describe("overdue", () => {
  it("flags a car still out past the time it was due back", () => {
    const map = buildMovementMap([out({ expected_return: "2026-11-10T10:00:00Z" })], NOW);
    expect(map.get("v1")?.overdue).toBe(true);
  });

  it("does not flag one that is still within its window", () => {
    const map = buildMovementMap([out({ expected_return: "2026-11-10T18:00:00Z" })], NOW);
    expect(map.get("v1")?.overdue).toBe(false);
  });

  it("never flags a car that is back, even if it came back late", () => {
    const map = buildMovementMap(
      [out({ expected_return: "2026-11-10T08:00:00Z" }), back()],
      NOW
    );
    expect(map.get("v1")?.overdue).toBe(false);
  });

  it("does not flag a sign-out with no expected return", () => {
    const map = buildMovementMap([out({ expected_return: null })], NOW);
    expect(map.get("v1")?.overdue).toBe(false);
  });
});

describe("movementStateOf", () => {
  it("treats a car with no movements as on the stand", () => {
    const state = movementStateOf("never-moved", buildMovementMap([], NOW));
    expect(state.isOut).toBe(false);
    expect(state.person).toBeNull();
  });
});

describe("movementsFor", () => {
  it("returns one vehicle's history, newest first", () => {
    const rows = [out({ id: "first" }), back({ id: "second" }), out({ id: "other", vehicle_id: "v2" })];
    const history = movementsFor(rows, "v1");
    expect(history.map((r) => r.id)).toEqual(["second", "first"]);
  });
});

describe("standCount", () => {
  it("splits the stand into cars present and cars signed out", () => {
    const map = buildMovementMap([out({ vehicle_id: "v2" })], NOW);
    const counts = standCount([{ id: "v1" }, { id: "v2" }, { id: "v3" }], map);
    expect(counts).toEqual({ total: 3, onStand: 2, signedOut: 1 });
  });

  it("counts everything as present when nothing has ever moved", () => {
    expect(standCount([{ id: "v1" }, { id: "v2" }], new Map()))
      .toEqual({ total: 2, onStand: 2, signedOut: 0 });
  });
});

describe("movementLabel", () => {
  it("names who has the car", () => {
    const map = buildMovementMap([out()], NOW);
    expect(movementLabel(map.get("v1")!)).toBe("Out · Musa Ibrahim");
  });

  it("copes with an unnamed sign-out", () => {
    const map = buildMovementMap([out({ person_name: null })], NOW);
    expect(movementLabel(map.get("v1")!)).toBe("Out");
  });

  it("reads plainly when the car is in", () => {
    const map = buildMovementMap([out(), back()], NOW);
    expect(movementLabel(map.get("v1")!)).toBe("On stand");
  });
});

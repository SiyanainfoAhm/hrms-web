import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampActivityMinutesToGross,
  idleMinutesFromGrossActiveBreak,
} from "./attendanceActivityAggregate";

function splitShift(args: {
  grossMinutes: number;
  activeRawMinutes: number;
  breakMinutes: number;
}) {
  const activeMinutes = clampActivityMinutesToGross(
    args.activeRawMinutes,
    args.grossMinutes,
    args.breakMinutes,
  );
  const idleMinutes = idleMinutesFromGrossActiveBreak({
    grossMinutes: args.grossMinutes,
    activeMinutes,
    breakMinutes: args.breakMinutes,
  });
  return { activeMinutes, idleMinutes };
}

describe("attendance activity vs lunch idle", () => {
  it("counts lunch in Total Idle when the agent treated the whole shift as active", () => {
    // Screenshot row: Gross 5h1m, Active 5h1m, Lunch 51m → Idle was 0
    const { activeMinutes, idleMinutes } = splitShift({
      grossMinutes: 5 * 60 + 1,
      activeRawMinutes: 5 * 60 + 1,
      breakMinutes: 51,
    });
    assert.equal(activeMinutes, 4 * 60 + 10);
    assert.equal(idleMinutes, 51);
    assert.equal(activeMinutes + idleMinutes, 5 * 60 + 1);
  });

  it("counts lunch in Total Idle when Active + Lunch overflowed Gross", () => {
    // Screenshot row: Gross 5h4m, Active 4h50m, Lunch 1h5m → Idle was 0
    const { activeMinutes, idleMinutes } = splitShift({
      grossMinutes: 5 * 60 + 4,
      activeRawMinutes: 4 * 60 + 50,
      breakMinutes: 65,
    });
    assert.equal(activeMinutes, 3 * 60 + 59);
    assert.equal(idleMinutes, 65);
    assert.equal(activeMinutes + idleMinutes, 5 * 60 + 4);
  });

  it("keeps leftover idle on top of lunch", () => {
    // Screenshot row that already balanced: Gross 5h12m, Active 4h15m, Lunch 56m, Idle 1m
    const { activeMinutes, idleMinutes } = splitShift({
      grossMinutes: 5 * 60 + 12,
      activeRawMinutes: 4 * 60 + 15,
      breakMinutes: 56,
    });
    assert.equal(activeMinutes, 4 * 60 + 15);
    assert.equal(idleMinutes, 57);
    assert.equal(activeMinutes + idleMinutes, 5 * 60 + 12);
  });

  it("leaves Idle at 0 when there is no break and Active fills Gross", () => {
    const { activeMinutes, idleMinutes } = splitShift({
      grossMinutes: 5 * 60 + 3,
      activeRawMinutes: 5 * 60 + 3,
      breakMinutes: 0,
    });
    assert.equal(activeMinutes, 5 * 60 + 3);
    assert.equal(idleMinutes, 0);
  });

  it("keeps full Gross as Idle when Active is 0 and there is no lunch", () => {
    const { activeMinutes, idleMinutes } = splitShift({
      grossMinutes: 4 * 60 + 46,
      activeRawMinutes: 0,
      breakMinutes: 0,
    });
    assert.equal(activeMinutes, 0);
    assert.equal(idleMinutes, 4 * 60 + 46);
  });

  it("still counts lunch in Total Idle if Active was not capped", () => {
    const idleMinutes = idleMinutesFromGrossActiveBreak({
      grossMinutes: 5 * 60 + 1,
      activeMinutes: 5 * 60 + 1,
      breakMinutes: 51,
    });
    assert.equal(idleMinutes, 51);
  });
});

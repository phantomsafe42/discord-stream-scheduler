import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiscordMessage,
  cleanSingleLine,
  pacificDateTimeToUnix,
  validateSchedule,
  validateServerPayload
} from "../public/core.js";

const base = {
  announcement: "THE WEEKEND BEGINS FR THIS TIME",
  date: "2026-07-31",
  includeEveryone: true,
  rows: [
    { name: "Daily Yap", time: "09:00", bold: false },
    { name: "RE5 CO-OP WITH FRIENDS", time: "12:30", bold: true }
  ],
  endTime: "17:00"
};

test("known PDT example converts to Unix seconds", () => {
  assert.equal(pacificDateTimeToUnix("2026-07-31", "09:00"), 1785513600);
});

test("winter PST date uses the correct offset", () => {
  assert.equal(
    pacificDateTimeToUnix("2026-01-15", "09:00"),
    Date.parse("2026-01-15T17:00:00Z") / 1000
  );
});

test("summer PDT date uses the correct offset", () => {
  assert.equal(
    pacificDateTimeToUnix("2026-07-15", "09:00"),
    Date.parse("2026-07-15T16:00:00Z") / 1000
  );
});

test("spring DST gap rejects a nonexistent Pacific wall time", () => {
  assert.throws(
    () => pacificDateTimeToUnix("2026-03-08", "02:30"),
    /does not exist because of daylight saving time/
  );
});

test("fall DST overlap chooses the first occurrence consistently", () => {
  assert.equal(
    pacificDateTimeToUnix("2026-11-01", "01:30"),
    Date.parse("2026-11-01T08:30:00Z") / 1000
  );
});

test("Discord message formats announcement, date, rows, bold, and end", () => {
  assert.equal(
    buildDiscordMessage(base),
    [
      "@everyone THE WEEKEND BEGINS FR THIS TIME",
      "",
      "🚨SCHEDULE 7/31/26🚨",
      "Daily Yap @ <t:1785513600:t>",
      "**RE5 CO-OP WITH FRIENDS @ <t:1785526200:t>**",
      "End @ <t:1785542400:t>"
    ].join("\n")
  );
});

test("user Markdown is preserved while line breaks are safely flattened", () => {
  const schedule = {
    ...base,
    announcement: "**Big**\nnight",
    includeEveryone: false,
    rows: [{ name: "_Finale_ `run`", time: "09:00", bold: false }],
    endTime: ""
  };
  assert.match(buildDiscordMessage(schedule), /^\*\*Big\*\* night\n\n/);
  assert.match(buildDiscordMessage(schedule), /_Finale_ `run` @ <t:1785513600:t>$/);
  assert.equal(cleanSingleLine("<script>\nalert(1)", 100), "<script> alert(1)");
});

test("validation warns about missing, duplicate, and out-of-order rows", () => {
  const warnings = validateSchedule({
    ...base,
    rows: [
      { name: "", time: "", bold: false },
      { name: "First", time: "12:00", bold: false },
      { name: "Duplicate", time: "12:00", bold: false },
      { name: "Earlier", time: "11:00", bold: false }
    ],
    endTime: ""
  });
  assert.ok(warnings.some((warning) => warning.includes("missing an event name")));
  assert.ok(warnings.some((warning) => warning.includes("missing a start time")));
  assert.ok(warnings.some((warning) => warning.includes("duplicate start time")));
  assert.ok(warnings.some((warning) => warning.includes("out of chronological order")));
});

test("server payload validation limits type and message length", () => {
  assert.deepEqual(
    validateServerPayload({ content: "hello", allowEveryone: false }),
    { content: "hello", allowEveryone: false }
  );
  assert.throws(() => validateServerPayload({ content: "x".repeat(2001), allowEveryone: false }), /2,000/);
  assert.throws(() => validateServerPayload({ content: "hello", allowEveryone: "yes" }), /mention setting/);
});

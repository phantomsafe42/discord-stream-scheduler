import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiscordMessage,
  cleanSingleLine,
  formatEventName,
  rememberEventName,
  tomorrowInUTC,
  utcDateTimeToUnix,
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

test("UTC wall time converts directly to Unix seconds", () => {
  assert.equal(utcDateTimeToUnix("2026-07-31", "09:00"), 1785488400);
});

test("UTC times remain valid through Pacific DST transitions", () => {
  assert.equal(utcDateTimeToUnix("2026-03-08", "02:30"), Date.parse("2026-03-08T02:30:00Z") / 1000);
  assert.equal(utcDateTimeToUnix("2026-11-01", "01:30"), Date.parse("2026-11-01T01:30:00Z") / 1000);
});

test("UTC tomorrow follows the UTC calendar across local-day boundaries", () => {
  assert.equal(tomorrowInUTC(new Date("2026-10-21T23:59:00Z")), "2026-10-22");
  assert.equal(tomorrowInUTC(new Date("2026-10-22T00:01:00Z")), "2026-10-23");
});

test("invalid UTC date and time inputs are rejected", () => {
  for (const [date, time] of [
    ["2026-02-30", "09:00"], ["2026-07-31", "24:00"], ["2026-07-31", "09:60"]
  ]) {
    assert.throws(() => utcDateTimeToUnix(date, time), /valid UTC date and time/);
  }
  assert.equal(utcDateTimeToUnix("0099-01-01", "00:00"), Date.parse("0099-01-01T00:00:00Z") / 1000);
});

test("Discord message formats announcement, date, rows, bold, and end", () => {
  assert.equal(
    buildDiscordMessage(base),
    [
      "@everyone THE WEEKEND BEGINS FR THIS TIME",
      "",
      "🚨SCHEDULE 7/31/26🚨",
      "Daily Yap @ <t:1785488400:t>",
      "**RE5 CO-OP WITH FRIENDS @ <t:1785501000:t>**",
      "End @ <t:1785517200:t>"
    ].join("\n")
  );
});

test("optional episode numbers appear after event names and leave saved names intact", () => {
  assert.equal(formatEventName("Daily Yap", "12"), "Daily Yap Ep. 12");
  assert.equal(formatEventName("Daily Yap", ""), "Daily Yap");
  assert.equal(formatEventName("Daily Yap", "0"), "Daily Yap Ep. 0");
  assert.equal(formatEventName("", "12"), "");
  const schedule = {
    ...base,
    rows: [{ name: "Daily Yap", episode: "12", time: "09:00", bold: false }]
  };
  assert.match(buildDiscordMessage(schedule), /Daily Yap Ep\. 12 @ <t:1785488400:t>/);
  assert.equal(rememberEventName([], schedule.rows[0].name)[0], "Daily Yap");
});

test("invalid episode numbers produce a warning and cannot be formatted", () => {
  for (const episode of ["-1", "1.5", "abc", "1e3"]) {
    const schedule = { ...base, rows: [{ name: "Daily Yap", episode, time: "09:00" }] };
    assert.ok(validateSchedule(schedule).some((warning) => warning.includes("Episode number")));
    assert.throws(() => buildDiscordMessage(schedule), /Episode number/);
  }
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
  assert.match(buildDiscordMessage(schedule), /_Finale_ `run` @ <t:1785488400:t>$/);
  assert.equal(cleanSingleLine("<script>\nalert(1)", 100), "<script> alert(1)");
});

test("previous event names are cleaned, deduplicated, and bounded", () => {
  const names = Array.from({ length: 50 }, (_, index) => `Event ${index}`);
  const updated = rememberEventName(names, "  event 1\n");
  assert.equal(updated[0], "event 1");
  assert.equal(updated.length, 50);
  assert.equal(updated.filter((name) => name.toLowerCase() === "event 1").length, 1);
  assert.equal(rememberEventName(updated, "New event").includes("Event 49"), false);
  assert.deepEqual(rememberEventName(updated, "  "), updated);
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

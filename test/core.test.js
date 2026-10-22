import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiscordMessage,
  cleanSingleLine,
  formatEventName,
  rememberEventName,
  tomorrowInHouston,
  houstonDateTimeToUnix,
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

test("Houston wall time converts to the correct Discord timestamp", () => {
  assert.equal(houstonDateTimeToUnix("2026-10-22", "11:00"), Date.parse("2026-10-22T16:00:00Z") / 1000);
  assert.equal(houstonDateTimeToUnix("2026-10-22", "12:00"), Date.parse("2026-10-22T17:00:00Z") / 1000);
  assert.equal(houstonDateTimeToUnix("2026-10-22", "13:30"), Date.parse("2026-10-22T18:30:00Z") / 1000);
  assert.equal(houstonDateTimeToUnix("2026-10-22", "15:00"), Date.parse("2026-10-22T20:00:00Z") / 1000);
});

test("October 22 screenshot schedule keeps the intended Houston times when pasted", () => {
  const message = buildDiscordMessage({
    announcement: "monkey business as usual",
    date: "2026-10-22",
    includeEveryone: true,
    rows: [
      { name: "Daily Yap", time: "11:00" },
      { name: "Egglocke", episode: "20", time: "12:00" },
      { name: "Wolverine", time: "13:30" }
    ],
    endTime: "15:00"
  });
  assert.equal(message, [
    "@everyone monkey business as usual", "", "🚨SCHEDULE 10/22/26🚨",
    "Daily Yap @ <t:1792684800:t>",
    "Egglocke Ep. 20 @ <t:1792688400:t>",
    "Wolverine @ <t:1792693800:t>",
    "End @ <t:1792699200:t>"
  ].join("\n"));
});

test("Houston daylight-saving gaps are rejected and repeated times choose the first occurrence", () => {
  assert.throws(() => houstonDateTimeToUnix("2026-03-08", "02:30"), /does not exist/);
  assert.equal(houstonDateTimeToUnix("2026-11-01", "01:30"), Date.parse("2026-11-01T06:30:00Z") / 1000);
  assert.equal(houstonDateTimeToUnix("2026-01-15", "09:00"), Date.parse("2026-01-15T15:00:00Z") / 1000);
});

test("Houston tomorrow follows the Houston calendar across local-day boundaries", () => {
  assert.equal(tomorrowInHouston(new Date("2026-10-22T04:59:00Z")), "2026-10-22");
  assert.equal(tomorrowInHouston(new Date("2026-10-22T05:01:00Z")), "2026-10-23");
});

test("invalid Houston date and time inputs are rejected", () => {
  for (const [date, time] of [
    ["2026-02-30", "09:00"], ["2026-07-31", "24:00"], ["2026-07-31", "09:60"]
  ]) {
    assert.throws(() => houstonDateTimeToUnix(date, time), /valid Houston date and time/);
  }
});

test("Discord message formats announcement, date, rows, bold, and end", () => {
  assert.equal(
    buildDiscordMessage(base),
    [
      "@everyone THE WEEKEND BEGINS FR THIS TIME",
      "",
      "🚨SCHEDULE 7/31/26🚨",
      `Daily Yap @ <t:${Date.parse("2026-07-31T14:00:00Z") / 1000}:t>`,
      `**RE5 CO-OP WITH FRIENDS @ <t:${Date.parse("2026-07-31T17:30:00Z") / 1000}:t>**`,
      `End @ <t:${Date.parse("2026-07-31T22:00:00Z") / 1000}:t>`
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
  assert.match(buildDiscordMessage(schedule), /Daily Yap Ep\. 12 @ <t:1785506400:t>/);
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
  assert.match(buildDiscordMessage(schedule), /_Finale_ `run` @ <t:1785506400:t>$/);
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

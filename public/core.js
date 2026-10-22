export const TIME_ZONE = "UTC";
export const MAX_ROWS = 20;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_EVENT_LENGTH = 100;
export const MAX_ANNOUNCEMENT_LENGTH = 240;
export const MAX_EVENT_NAME_HISTORY = 50;

export function utcDateTimeToUnix(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new RangeError("Enter a valid date and time.");
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, 0, 0);
  if (
    instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day || instant.getUTCHours() !== hour ||
    instant.getUTCMinutes() !== minute
  ) {
    throw new RangeError("Enter a valid UTC date and time.");
  }
  return instant.getTime() / 1000;
}

export function tomorrowInUTC(now = new Date()) {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
}

export function formatScheduleDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${month}/${day}/${String(year).slice(-2)}`;
}

export function cleanSingleLine(value, maxLength) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function rememberEventName(names, value) {
  const name = cleanSingleLine(value, MAX_EVENT_LENGTH);
  if (!name) return names;
  return [name, ...names.filter((previous) => previous.toLocaleLowerCase() !== name.toLocaleLowerCase())]
    .slice(0, MAX_EVENT_NAME_HISTORY);
}

export function validateSchedule(schedule) {
  const warnings = [];
  const rows = Array.isArray(schedule.rows) ? schedule.rows.slice(0, MAX_ROWS) : [];
  let previousTimestamp = null;
  const seenTimes = new Set();

  rows.forEach((row, index) => {
    const label = `Row ${index + 1}`;
    if (!cleanSingleLine(row.name, MAX_EVENT_LENGTH)) warnings.push(`${label} is missing an event name.`);
    if (!row.time) {
      warnings.push(`${label} is missing a start time.`);
      return;
    }
    try {
      const timestamp = utcDateTimeToUnix(schedule.date, row.time);
      if (seenTimes.has(timestamp)) warnings.push(`${label} has a duplicate start time.`);
      if (previousTimestamp !== null && timestamp < previousTimestamp) {
        warnings.push(`${label} is out of chronological order.`);
      }
      seenTimes.add(timestamp);
      previousTimestamp = timestamp;
    } catch (error) {
      warnings.push(`${label}: ${error.message}`);
    }
  });

  if (schedule.endTime) {
    try {
      const endTimestamp = utcDateTimeToUnix(schedule.date, schedule.endTime);
      if (seenTimes.has(endTimestamp)) warnings.push("End has a duplicate time.");
      if (previousTimestamp !== null && endTimestamp < previousTimestamp) {
        warnings.push("End is earlier than the final event.");
      }
    } catch (error) {
      warnings.push(`End: ${error.message}`);
    }
  }
  return warnings;
}

export function buildDiscordMessage(schedule) {
  const announcement = cleanSingleLine(schedule.announcement, MAX_ANNOUNCEMENT_LENGTH);
  const lines = [];
  const prefix = schedule.includeEveryone ? "@everyone" : "";
  if (prefix || announcement) lines.push([prefix, announcement].filter(Boolean).join(" "));
  if (lines.length) lines.push("");
  lines.push(`🚨SCHEDULE ${formatScheduleDate(schedule.date)}🚨`);

  const rows = (Array.isArray(schedule.rows) ? schedule.rows : []).slice(0, MAX_ROWS);
  for (const row of rows) {
    const name = cleanSingleLine(row.name, MAX_EVENT_LENGTH);
    if (!name || !row.time) continue;
    const timestamp = utcDateTimeToUnix(schedule.date, row.time);
    const line = `${name} @ <t:${timestamp}:t>`;
    lines.push(row.bold ? `**${line}**` : line);
  }

  if (schedule.endTime) {
    const timestamp = utcDateTimeToUnix(schedule.date, schedule.endTime);
    lines.push(`End @ <t:${timestamp}:t>`);
  }

  const message = lines.join("\n");
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new RangeError(`Message is ${message.length - MAX_MESSAGE_LENGTH} characters over Discord's limit.`);
  }
  return message;
}

export function validateServerPayload(payload) {
  if (!payload || typeof payload !== "object") throw new TypeError("Invalid request.");
  const content = String(payload.content ?? "");
  if (!content.trim()) throw new RangeError("Message content is required.");
  if (content.length > MAX_MESSAGE_LENGTH) throw new RangeError("Message exceeds Discord's 2,000 character limit.");
  if (typeof payload.allowEveryone !== "boolean") throw new TypeError("Invalid mention setting.");
  return { content, allowEveryone: payload.allowEveryone };
}

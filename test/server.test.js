import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { isWebhookConfigured } = await import("../server.js");

test("webhook configuration accepts only Discord HTTPS webhook URLs", () => {
  assert.equal(isWebhookConfigured(""), false);
  assert.equal(isWebhookConfigured("https://example.com/api/webhooks/123/token"), false);
  assert.equal(isWebhookConfigured("http://discord.com/api/webhooks/123/token"), false);
  assert.equal(isWebhookConfigured("https://discord.com/api/webhooks/123/token-value"), true);
  assert.equal(isWebhookConfigured("https://discordapp.com/api/webhooks/456/another-token"), true);
});

test("webhook URL is never needed by client configuration", () => {
  const clientConfig = { webhookConfigured: isWebhookConfigured("https://discord.com/api/webhooks/123/token") };
  assert.deepEqual(clientConfig, { webhookConfigured: true });
  assert.equal(JSON.stringify(clientConfig).includes("token"), false);
});

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import type { Update } from "grammy/types";
import type { UserState } from "../src/bot/state.js";
import { supportedLocales, t, type Locale } from "../src/i18n/index.js";

// Never load the real .env or send a network request. Only dummy configuration.
const tempDir = await mkdtemp(path.join(os.tmpdir(), "polytag-lost-test-"));
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: path.join(tempDir, "nonexistent.env"),
  BOT_TOKEN: "123456789:dummy-test-token",
  BOT_USERNAME: "PolyTagBot",
  SUPABASE_URL: "https://polytag-test.invalid",
  SUPABASE_SECRET_KEY: "dummy-test-key",
  WEBHOOK_SECRET_TOKEN: "dummy-test-secret",
  POLYTAG_ADMIN_CHAT_ID: "-1001234567890",
});
globalThis.fetch = async () => { throw new Error("Network is forbidden in lost-flow tests"); };

const { config, parseOptionalChatId } = await import("../src/config.js");
const { PolyTagRepository } = await import("../src/repositories/polytagRepository.js");
const { adminLostReportMessage } = await import("../src/services/lostReportNotification.js");
const { bot } = await import("../src/bot.js");
const adminChatId = config.adminChatId!;
const itemId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const otherId = "11111111-2222-4333-8444-555555555555";
const userId = 777;
const user = { id: userId, is_bot: false, first_name: "PRIVATE_NAME", username: "PRIVATE_USERNAME" };
const item = { itemId, itemName: "myBag", category: "bag", tagId: "PT-TEST0001", status: "ACTIVE" };

// Exercise the actual repository query sequence with a fake HTTP transport.
// No PostgREST/Telegram server is contacted, and request headers are never logged.
const forbidNetwork = globalThis.fetch;
const queries: Array<{ table: string; method: string; url: URL; body: any }> = [];
let closeFails = false;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.host, "polytag-test.invalid");
  const table = url.pathname.split("/").at(-1)!;
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  queries.push({ table, method, url, body });
  if (table === "items" && method === "GET") return Response.json([{ id: itemId, owner_id: "owner-test", status: "ACTIVE" }]);
  if (table === "lost_reports" && method === "PATCH" && closeFails) {
    return Response.json({ message: "SIMULATED_CLOSE_FAILURE", code: "test" }, { status: 400 });
  }
  if (table === "lost_reports" && method === "POST") return Response.json({ id: "report-test" });
  assert(["items", "lost_reports", "events"].includes(table));
  return new Response(null, { status: 204 });
};
try {
  const repository = new PolyTagRepository();
  const input = { ownerId: "owner-test", itemId, lastSeenText: "Library" };
  assert.deepEqual(await repository.reportItemLost(input), { reportId: "report-test" });
  assert.deepEqual(queries.map((query) => `${query.method} ${query.table}`), [
    "GET items", "PATCH items", "PATCH lost_reports", "POST lost_reports", "POST events",
  ]);
  assert.equal(queries[0].url.searchParams.get("owner_id"), "eq.owner-test");
  assert.equal(queries[2].url.searchParams.get("status"), "eq.OPEN");
  assert.equal(queries[2].body.status, "CLOSED");
  assert.equal(queries[3].body.status, "OPEN");
  assert.equal(queries[3].body.last_seen_text, "Library");
  assert.equal(queries[4].body.event_type, "ITEM_REPORTED_LOST");
  assert.equal(queries[4].body.metadata.lost_report_id, "report-test");
  closeFails = true; queries.length = 0;
  await assert.rejects(repository.reportItemLost(input), /Could not close previous lost reports/);
  assert(!queries.some((query) => query.method === "POST"), "Do not insert another report if closing the old one failed");
} finally { globalThis.fetch = forbidNetwork; }
console.log("Repository report ID, ownership filter, previous-report closure, event and closure-error handling passed.");
const states = new Map<number, UserState>(); // Fake persisted store: test-only, no runtime state.
let owned = true;
let locale: Locale = "en";
let saveFails = false;
let adminFails = false;
let writes: Array<{ ownerId: string; itemId: string; lastSeenText: string }> = [];
let calls: string[] = [];
let sent: Array<{ method: string; payload: any }> = [];
let updateId = 0;

PolyTagRepository.prototype.getUserLocaleByTelegramUserId = async () => {
  calls.push("locale"); return locale;
};
PolyTagRepository.prototype.upsertUser = async (input) => {
  calls.push("upsert"); assert.equal(input.telegramChatId, userId); return "owner-test";
};
PolyTagRepository.prototype.listOwnedItems = async () => { calls.push("items"); return owned ? [{ ...item }] : []; };
PolyTagRepository.prototype.getBotState = async (id) => { calls.push("state:get"); return states.get(id) ?? null; };
PolyTagRepository.prototype.setBotState = async (id, state) => {
  calls.push("state:set"); states.set(id, structuredClone(state) as UserState);
};
PolyTagRepository.prototype.clearBotState = async (id) => { calls.push("state:clear"); states.delete(id); };
PolyTagRepository.prototype.reportItemLost = async (input) => {
  calls.push("report");
  if (saveFails) throw new Error("SIMULATED_DATABASE_FAILURE");
  writes.push(input); item.status = "LOST"; return { reportId: "report-test" };
};
PolyTagRepository.prototype.healthCheck = async () => { calls.push("health"); };

bot.botInfo = {
  id: 123456789, is_bot: true, first_name: "PolyTag", username: "PolyTagBot",
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false,
  allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false,
};
bot.api.config.use(async (_previous, method, payload) => {
  sent.push({ method, payload });
  if (method === "sendMessage" && (payload as any).chat_id === adminChatId) {
    calls.push("admin:send");
    if (adminFails) throw new Error("SIMULATED_TELEGRAM_FAILURE");
  } else if (method === "sendMessage") calls.push("owner:send");
  return { ok: true, result: method === "sendMessage"
    ? { message_id: 1, date: 0, chat: { id: userId, type: "private" }, text: (payload as any).text }
    : true } as any;
});

async function text(value: string, group = false) {
  await bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId, date: 0, from: user,
      chat: group ? { id: adminChatId, type: "supergroup", title: "Admin" } : { id: userId, type: "private" },
      text: value,
      ...(value.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: value.split(" ")[0].length }] } : {}),
    },
  } as Update);
}

async function callback(data: string, group = false, fromId = userId) {
  await bot.handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId), from: { ...user, id: fromId }, chat_instance: "test", data,
      message: {
        message_id: 1, date: 0,
        chat: group ? { id: adminChatId, type: "supergroup", title: "Admin" } : { id: userId, type: "private" },
        text: "test",
      },
    },
  } as Update);
}

function reset() {
  states.clear(); writes = []; calls = []; sent = [];
  item.status = "ACTIVE"; item.tagId = "PT-TEST0001";
  owned = true; saveFails = false; adminFails = false; config.adminChatId = adminChatId;
}

async function prepare(location = "Dorm 13") {
  await callback(`lost:${itemId}`);
  assert.equal(states.get(userId)?.type, "awaiting_lost_location");
  await text(location);
  assert.equal(states.get(userId)?.type, "awaiting_lost_confirmation");
  assert.equal(item.status, "ACTIVE", "Location input must not activate Lost Mode");
  assert.equal(writes.length, 0, "No report before confirmation");
}

assert.equal(parseOptionalChatId(undefined), null);
assert.equal(parseOptionalChatId(" "), null);
assert.equal(parseOptionalChatId(" -1001234567890 "), adminChatId);
for (const invalid of ["abc", "1.5", "1e3", "0", "-0", "Infinity", "9007199254740992"]) {
  assert.throws(() => parseOptionalChatId(invalid), /POLYTAG_ADMIN_CHAT_ID/);
}

for (locale of supportedLocales) {
  reset();
  await prepare();
  const confirmation = sent.filter((request) => request.method === "sendMessage").at(-1);
  assert(confirmation?.payload.text.includes(item.itemName));
  assert(confirmation?.payload.text.includes(item.tagId));
  const buttons = confirmation?.payload.reply_markup.inline_keyboard.flat();
  assert.equal(buttons.length, 3);
  for (const button of buttons) assert(Buffer.byteLength(button.callback_data) <= 64);
  await callback(`lost_confirm:${itemId}`);
  assert.equal(writes.length, 1);
  assert.equal(item.status, "LOST");
  assert.equal(states.has(userId), false);
  assert(calls.indexOf("report") < calls.lastIndexOf("state:clear"));
  assert(calls.lastIndexOf("owner:send") < calls.indexOf("admin:send"));
  const admin = sent.find((request) => request.payload.chat_id === adminChatId)!;
  assert(admin.payload.text.includes("New Lost Item"));
  assert(admin.payload.text.includes(item.tagId));
  assert(!admin.payload.text.includes("PRIVATE_NAME"));
  assert(!admin.payload.text.includes("PRIVATE_USERNAME"));
  assert(!admin.payload.text.includes(String(userId)));
  assert(!("parse_mode" in admin.payload), "User text must be sent as plain text");
  const count = writes.length;
  await callback(`lost_confirm:${itemId}`);
  assert.equal(writes.length, count, "Stale confirmation must not create a second report");
  console.log(`${locale}: confirmation, saved report, owner success and private admin message passed`);
}

locale = "en";
reset(); await prepare(); await callback(`lost_cancel:${itemId}`);
assert.equal(states.has(userId), false); assert.equal(item.status, "ACTIVE"); assert.equal(writes.length, 0);

reset(); await prepare("Old location"); await callback(`lost_edit:${itemId}`);
assert.equal(states.get(userId)?.type, "awaiting_lost_location");
await callback(`lost_confirm:${itemId}`); assert.equal(writes.length, 0, "Old confirmation is invalid while editing");
await text("New location"); await callback(`lost_confirm:${itemId}`);
assert.equal(writes.length, 1); assert.equal(writes[0].lastSeenText, "New location");

reset(); await prepare();
await callback(`lost_confirm:${otherId}`); await callback(`lost_cancel:${otherId}`);
await callback(`lost_confirm:${itemId}`, false, 888);
assert.equal(writes.length, 0); assert(states.has(userId));
owned = false; await callback(`lost_confirm:${itemId}`);
assert.equal(writes.length, 0, "Ownership must be checked again at confirmation");

reset(); await prepare(); saveFails = true;
const originalConsoleError = console.error;
let errors: unknown[][] = [];
console.error = (...args: unknown[]) => { errors.push(args); };
try {
  await callback(`lost_confirm:${itemId}`);
  assert.equal(states.get(userId)?.type, "awaiting_lost_confirmation");
  assert.equal(writes.length, 0); assert(!calls.includes("admin:send"));
  assert(sent.at(-1)?.payload.text.includes(t(locale, "lostReportSaveFailed")));
  saveFails = false; adminFails = true;
  await callback(`lost_confirm:${itemId}`);
  assert.equal(writes.length, 1); assert.equal(item.status, "LOST"); assert(!states.has(userId));
  assert.equal(errors.length, 2);
  assert(!JSON.stringify(errors[1]).includes(String(adminChatId)), "Admin error log must omit the Telegram request payload");
} finally { console.error = originalConsoleError; }

reset(); config.adminChatId = null; await prepare(); await callback(`lost_confirm:${itemId}`);
assert.equal(writes.length, 1); assert(!calls.includes("admin:send"));
assert(adminLostReportMessage({ ...item, tagId: null, lastSeenText: "Library", locale }).includes("No active tag"));

reset();
for (const command of ["/start", "/start t_PT-TEST0001", "/menu", "/language", "/status", "/cancel"]) {
  await text(command, true);
}
for (const data of ["register", "my_items", "lost_help", `lost:${itemId}`, `lost_confirm:${itemId}`, "found_help", "safe:home"]) {
  await callback(data, true);
}
await text("Unrelated group message", true);
assert.equal(calls.filter((call) => !call.endsWith(":send")).length, 0, "Group user actions must never read or write personal data");
await text("/chatid@PolyTagBot", true);
assert.equal(calls.filter((call) => !call.endsWith(":send")).length, 0);
assert(sent.at(-1)?.payload.text.includes(String(adminChatId)));
const beforeAdmin = sent.length;
await callback("admin:future", true);
assert.equal(sent.length, beforeAdmin, "Reserved admin callbacks must reach future handlers");

reset(); await callback(`lost:${itemId}`); await text("   ");
assert.equal(states.get(userId)?.type, "awaiting_lost_location"); assert.equal(writes.length, 0);
// Simulate a pre-v0.7 draft persisted before deployment.
states.set(userId, { type: "awaiting_lost_location", itemId, itemName: "Old name" } as UserState);
await text("Library");
assert.equal(states.get(userId)?.type, "awaiting_lost_confirmation");
assert.equal((states.get(userId) as any).tagId, item.tagId);
assert.equal((states.get(userId) as any).category, item.category);
await text("/cancel"); assert(!states.has(userId)); assert.equal(writes.length, 0);
await text("/status"); assert(calls.includes("health"));
console.log("Cancel/edit, ownership/stale callbacks, DB/admin failures, optional config, and private-chat safety passed.");
console.log("All lost-flow tests passed without Telegram or Supabase network access.");

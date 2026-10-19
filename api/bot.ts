import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";
import { config } from "../src/config.js";

const handleUpdate = webhookCallback(bot, "std/http", {
  secretToken: config.webhookSecretToken,
  timeoutMilliseconds: 55_000,
});

export default {
  fetch(request: Request) {
    return handleUpdate(request);
  },
};

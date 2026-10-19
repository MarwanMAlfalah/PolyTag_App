import "dotenv/config";
import { Bot } from "grammy";
import { config } from "../src/config.js";

const url = process.argv[2]?.trim();
if (!url?.startsWith("https://")) {
  console.error("Usage: npm run webhook:set -- https://YOUR-PROJECT.vercel.app/api/bot");
  process.exit(1);
}

const bot = new Bot(config.botToken);
const result = await bot.api.setWebhook(url, {
  secret_token: config.webhookSecretToken,
  allowed_updates: ["message", "callback_query"],
});
console.log("Webhook configured:", result);
console.log(await bot.api.getWebhookInfo());

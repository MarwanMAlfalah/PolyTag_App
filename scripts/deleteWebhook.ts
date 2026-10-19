import "dotenv/config";
import { Bot } from "grammy";
import { config } from "../src/config.js";

const bot = new Bot(config.botToken);
console.log("Webhook deleted:", await bot.api.deleteWebhook());

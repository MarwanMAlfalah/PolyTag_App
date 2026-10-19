import { bot } from "./bot.js";
import { PolyTagRepository } from "./repositories/polytagRepository.js";

const repository = new PolyTagRepository();

async function main() {
  console.log("Checking Supabase connection...");
  await repository.healthCheck();
  console.log("Supabase database is ready.");

  const webhook = await bot.api.getWebhookInfo();
  if (webhook.url) {
    throw new Error(
      `Telegram webhook is currently set to ${webhook.url}. Run \"npm run webhook:delete\" before using local long polling.`,
    );
  }

  await bot.start({
    onStart: (botInfo) => {
      console.log(`PolyTag bot is running locally as @${botInfo.username}`);
    },
  });
}

main().catch((error) => {
  console.error("PolyTag startup failed:", error);
  process.exit(1);
});

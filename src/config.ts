import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing. Add it to .env`);
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  botUsername: required("BOT_USERNAME").replace(/^@/, ""),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  webhookSecretToken: required("WEBHOOK_SECRET_TOKEN"),
};

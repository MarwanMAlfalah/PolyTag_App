import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing. Add it to .env`);
  return value;
}

export function parseOptionalChatId(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const id = Number(trimmed);
  if (!/^-?\d+$/.test(trimmed) || !Number.isSafeInteger(id) || id === 0) {
    throw new Error("POLYTAG_ADMIN_CHAT_ID must be a non-zero safe integer Telegram chat ID.");
  }
  return id;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  botUsername: required("BOT_USERNAME").replace(/^@/, ""),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  webhookSecretToken: required("WEBHOOK_SECRET_TOKEN"),
  adminChatId: parseOptionalChatId(process.env.POLYTAG_ADMIN_CHAT_ID),
};

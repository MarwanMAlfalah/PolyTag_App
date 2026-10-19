import { Bot, InlineKeyboard, InputFile } from "grammy";
import { config } from "./config.js";
import {
  categoryKeyboard,
  foundTagKeyboard,
  homeKeyboard,
  itemCategories,
  languageKeyboard,
} from "./bot/keyboards.js";
import type { UserState } from "./bot/state.js";
import {
  categoryLabel,
  itemStatusLabel,
  normalizeLocale,
  type Locale,
  t,
} from "./i18n/index.js";
import { PolyTagRepository } from "./repositories/polytagRepository.js";
import { generateUniqueTagToken } from "./services/tagToken.js";
import { buildStickerAssets } from "./services/stickerService.js";

const bot = new Bot(config.botToken);
const repository = new PolyTagRepository();

function normalizeTagId(value: string) {
  return value.trim().replace(/^t_/i, "").toUpperCase();
}

async function ensureUser(ctx: any): Promise<string> {
  return repository.upsertUser({
    telegramUserId: ctx.from.id,
    telegramChatId: ctx.chat.id,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    languageCode: ctx.from.language_code,
  });
}

async function localeForTelegramUser(telegramUserId: number): Promise<Locale> {
  const stored = await repository.getUserLocaleByTelegramUserId(telegramUserId);
  return normalizeLocale(stored);
}

async function localeForContext(ctx: any): Promise<Locale> {
  if (!ctx.from) return "ru";
  return localeForTelegramUser(ctx.from.id);
}

async function showHome(ctx: any, locale: Locale) {
  await ctx.reply(
    `${t(locale, "welcomeTitle")}\n\n${t(locale, "welcomeBody")}\n\n${t(locale, "languageHint")}`,
    { reply_markup: homeKeyboard(locale) },
  );
}

async function showSafety(ctx: any, locale: Locale, tagId?: string) {
  const keyboard = tagId
    ? new InlineKeyboard().text(t(locale, "backToItem"), `tag:${tagId}`)
    : homeKeyboard(locale);

  await ctx.reply(
    `${t(locale, "safetyTitle")}\n\n${t(locale, "safetyBody", {
      botUsername: config.botUsername,
    })}`,
    { reply_markup: keyboard },
  );
}

async function showFoundTag(ctx: any, tagId: string, forcedLocale?: Locale) {
  const locale = forcedLocale ?? (ctx.from ? await localeForContext(ctx) : "ru");
  const record = await repository.getTag(tagId);

  if (!record) {
    await ctx.reply(t(locale, "tagInactive", { tagId }), {
      reply_markup: homeKeyboard(locale),
    });
    return;
  }

  if (ctx.from) {
    await repository.logTagScan(record, ctx.from.id);
  }

  const statusNotice =
    record.itemStatus === "LOST"
      ? t(locale, "lostNotice")
      : record.itemStatus === "FOUND"
        ? t(locale, "foundNotice")
        : "";

  await ctx.reply(
    t(locale, "foundTaggedItem", {
      itemName: record.itemName,
      statusNotice,
      botUsername: config.botUsername,
    }),
    { reply_markup: foundTagKeyboard(locale, tagId) },
  );
}

bot.command("start", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;

  await repository.clearBotState(ctx.from.id);
  const payload = ctx.match?.trim() ?? "";

  // A finder who only scans a tag is not forced to create a full PolyTag user record.
  if (payload.toLowerCase().startsWith("t_")) {
    await showFoundTag(ctx, normalizeTagId(payload));
    return;
  }

  await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  await showHome(ctx, locale);
});

bot.command("menu", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await repository.clearBotState(ctx.from.id);
  await ensureUser(ctx);
  await showHome(ctx, await localeForContext(ctx));
});

bot.command("language", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  await ctx.reply(t(locale, "chooseLanguage"), {
    reply_markup: languageKeyboard("home"),
  });
});

bot.callbackQuery("register", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  await ensureUser(ctx);
  await repository.clearBotState(ctx.from.id);
  const locale = await localeForContext(ctx);
  await ctx.reply(t(locale, "chooseCategory"), {
    reply_markup: categoryKeyboard(locale),
  });
});

bot.callbackQuery("my_items", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const ownerId = await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  const items = await repository.listOwnedItems(ownerId);

  if (!items.length) {
    await ctx.reply(t(locale, "noItems"), { reply_markup: homeKeyboard(locale) });
    return;
  }

  const lines = items.map((item, index) => {
    const tag = item.tagId ? `\n   PolyTag ID: ${item.tagId}` : "";
    return `${index + 1}. ${categoryLabel(locale, item.category)} — ${item.itemName}\n   ${itemStatusLabel(locale, item.status)}${tag}`;
  });

  await ctx.reply(`${t(locale, "myItemsTitle")}\n\n${lines.join("\n\n")}`, {
    reply_markup: homeKeyboard(locale),
  });
});

bot.callbackQuery("lost_help", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  await repository.clearBotState(ctx.from.id);
  const ownerId = await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  const items = await repository.listOwnedItems(ownerId);
  const candidates = items.filter((item) =>
    ["ACTIVE", "RECOVERED", "FOUND"].includes(item.status),
  );

  if (!candidates.length) {
    await ctx.reply(t(locale, "noLostCandidates"), {
      reply_markup: homeKeyboard(locale),
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const item of candidates.slice(0, 12)) {
    keyboard.text(
      `${categoryLabel(locale, item.category)} ${item.itemName}`.slice(0, 50),
      `lost:${item.itemId}`,
    );
    keyboard.row();
  }

  await ctx.reply(t(locale, "chooseLostItem"), { reply_markup: keyboard });
});

bot.callbackQuery(/^lost:(.+)$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const ownerId = await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  const itemId = ctx.match[1];
  const items = await repository.listOwnedItems(ownerId);
  const item = items.find((candidate) => candidate.itemId === itemId);

  if (!item) {
    await ctx.reply(t(locale, "itemNotFound"), { reply_markup: homeKeyboard(locale) });
    return;
  }

  await repository.setBotState(ctx.from.id, {
    type: "awaiting_lost_location",
    itemId: item.itemId,
    itemName: item.itemName,
  });

  await ctx.reply(t(locale, "askLastSeen", { itemName: item.itemName }));
});

bot.callbackQuery(/^recovered:(.+)$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const ownerId = await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  const ok = await repository.markItemRecovered({ ownerId, itemId: ctx.match[1] });

  if (!ok) {
    await ctx.reply(t(locale, "recoverFailed"));
    return;
  }

  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply(t(locale, "recoveredSuccess"), {
    reply_markup: homeKeyboard(locale),
  });
});

bot.callbackQuery(/^cat:(.+)$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const locale = await localeForContext(ctx);
  const category = ctx.match[1];
  const isValid = itemCategories.some((item) => item.id === category);

  if (!isValid) {
    await ctx.reply(t(locale, "invalidCategory"));
    return;
  }

  await repository.setBotState(ctx.from.id, { type: "awaiting_item_name", category });
  await ctx.reply(
    t(locale, "categorySelected", { category: categoryLabel(locale, category) }),
  );
});

bot.callbackQuery("found_help", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  await repository.setBotState(ctx.from.id, { type: "awaiting_manual_found_tag_id" });
  await ctx.reply(t(locale, "manualFoundPrompt"));
});

bot.callbackQuery(/^found:(.+)$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const locale = await localeForContext(ctx);
  const tagId = normalizeTagId(ctx.match[1]);
  const record = await repository.getTag(tagId);
  await ctx.answerCallbackQuery();

  if (!record) {
    await ctx.reply(t(locale, "tagNotRegistered"));
    return;
  }

  await repository.setBotState(ctx.from.id, { type: "awaiting_finder_message", tagId });
  await ctx.reply(t(locale, "sendFinderMessage"));
});

bot.callbackQuery(/^tag:(.+)$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  await showFoundTag(ctx, normalizeTagId(ctx.match[1]));
});

bot.callbackQuery("lang_menu:home", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  await ensureUser(ctx);
  const locale = await localeForContext(ctx);
  await ctx.reply(t(locale, "chooseLanguage"), {
    reply_markup: languageKeyboard("home"),
  });
});

bot.callbackQuery(/^lang_menu:found:(.+)$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const locale = await localeForContext(ctx);
  await ctx.reply(t(locale, "chooseLanguage"), {
    reply_markup: languageKeyboard("found", normalizeTagId(ctx.match[1])),
  });
});

bot.callbackQuery(/^lang:([a-z]{2}):home$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  await ensureUser(ctx);
  const locale = normalizeLocale(ctx.match[1]);
  await repository.setUserLocale({ telegramUserId: ctx.from.id, locale });
  await repository.clearBotState(ctx.from.id);
  await ctx.reply(t(locale, "languageChanged"));
  await showHome(ctx, locale);
});

bot.callbackQuery(/^lang:([a-z]{2}):found:(.+)$/, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  await ensureUser(ctx);
  const locale = normalizeLocale(ctx.match[1]);
  const tagId = normalizeTagId(ctx.match[2]);
  await repository.setUserLocale({ telegramUserId: ctx.from.id, locale });
  await repository.clearBotState(ctx.from.id);
  await ctx.reply(t(locale, "languageChanged"));
  await showFoundTag(ctx, tagId, locale);
});

bot.callbackQuery("safe:home", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const locale = await localeForContext(ctx);
  await showSafety(ctx, locale);
});

bot.callbackQuery(/^safe:(PT-[A-Z0-9]{8}|TEST[0-9A-Z_-]+)$/i, async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await ctx.answerCallbackQuery();
  const locale = await localeForContext(ctx);
  await showSafety(ctx, locale, normalizeTagId(ctx.match[1]));
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  if (ctx.message.text.startsWith("/")) return;

  const state = (await repository.getBotState(ctx.from.id)) as UserState | null;
  if (!state) return;
  const locale = await localeForContext(ctx);

  if (state.type === "awaiting_item_name") {
    const itemName = ctx.message.text.trim().slice(0, 80);

    if (itemName.length < 2) {
      await ctx.reply(t(locale, "invalidItemName"));
      return;
    }

    const ownerId = await ensureUser(ctx);
    const tagId = await generateUniqueTagToken(repository);
    const registered = await repository.registerTaggedItem(
      ownerId,
      tagId,
      itemName,
      state.category,
    );

    await repository.clearBotState(ctx.from.id);
    const deepLink = `https://t.me/${config.botUsername}?start=t_${tagId}`;

    await ctx.reply(
      t(locale, "itemRegistered", {
        category: categoryLabel(locale, state.category),
        itemName,
        tagId,
      }),
    );

    try {
      const assets = await buildStickerAssets({
        tagId,
        deepLink,
        botUsername: config.botUsername,
        locale,
      });

      await ctx.replyWithPhoto(new InputFile(assets.png, `PolyTag-${tagId}.png`), {
        caption: t(locale, "stickerCaption", {
          tagId,
          botUsername: config.botUsername,
        }),
      });

      await ctx.replyWithDocument(
        new InputFile(assets.pdf, `PolyTag-${tagId}-50x30mm.pdf`),
        { caption: t(locale, "printableCaption") },
      );

      await repository.logStickerGenerated({
        ownerId,
        itemId: registered.itemId,
        tagDbId: registered.tagDbId,
        tagId,
      });
    } catch (error) {
      console.error("PolyTag sticker generation warning:", error);
      await ctx.reply(t(locale, "stickerFailed", { tagId, deepLink }));
    }

    await ctx.reply(t(locale, "testLink", { deepLink }), {
      reply_markup: homeKeyboard(locale),
    });
    return;
  }

  if (state.type === "awaiting_lost_location") {
    const lastSeenText = ctx.message.text.trim().slice(0, 160);
    if (!lastSeenText) {
      await ctx.reply(t(locale, "lastSeenRequired"));
      return;
    }

    const ownerId = await ensureUser(ctx);
    await repository.reportItemLost({ ownerId, itemId: state.itemId, lastSeenText });

    await repository.clearBotState(ctx.from.id);
    await ctx.reply(
      t(locale, "lostModeActivated", {
        itemName: state.itemName,
        lastSeen: lastSeenText,
      }),
      { reply_markup: homeKeyboard(locale) },
    );
    return;
  }

  if (state.type === "awaiting_manual_found_tag_id") {
    const tagId = normalizeTagId(ctx.message.text);
    await repository.clearBotState(ctx.from.id);
    await showFoundTag(ctx, tagId, locale);
    return;
  }

  if (state.type === "awaiting_finder_message") {
    const record = await repository.getTag(state.tagId);

    if (!record) {
      await repository.clearBotState(ctx.from.id);
      await ctx.reply(t(locale, "itemNoLongerActive"));
      return;
    }

    const finderMessage = ctx.message.text.trim().slice(0, 500);
    if (!finderMessage) {
      await ctx.reply(t(locale, "finderMessageRequired"));
      return;
    }

    await repository.createFoundReport({
      tag: record,
      finderTelegramUserId: ctx.from.id,
      finderTelegramChatId: ctx.chat.id,
      message: finderMessage,
      finderLocale: locale,
    });

    const ownerLocale = normalizeLocale(
      await repository.getUserLocaleById(record.ownerUserId),
    );
    const ownerKeyboard = new InlineKeyboard().text(
      t(ownerLocale, "recoveredButton"),
      `recovered:${record.itemId}`,
    );

    await bot.api.sendMessage(
      record.ownerChatId,
      `${t(ownerLocale, "ownerFoundTitle")}\n\n${t(ownerLocale, "itemLabel")}: ${record.itemName}\nPolyTag ID: ${record.tagId}\n\n${t(ownerLocale, "anonymousMessage")}:\n“${finderMessage}”\n\n${t(ownerLocale, "ownerPrivacy")}`,
      { reply_markup: ownerKeyboard },
    );

    await repository.clearBotState(ctx.from.id);
    await ctx.reply(t(locale, "thankFinder"), {
      reply_markup: homeKeyboard(locale),
    });
  }
});

bot.command("cancel", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await repository.clearBotState(ctx.from.id);
  const locale = await localeForContext(ctx);
  await ctx.reply(t(locale, "cancelled"), { reply_markup: homeKeyboard(locale) });
});

bot.command("status", async (ctx) => {
  await repository.healthCheck();
  const locale = ctx.from ? await localeForContext(ctx) : "ru";
  await ctx.reply(t(locale, "statusOk"));
});

bot.catch((err) => {
  console.error("PolyTag bot error:", err.error);
});

export { bot };

import { supabase } from "../db/supabase.js";

export type TelegramUserInput = {
  telegramUserId: number;
  telegramChatId: number;
  username?: string;
  firstName?: string;
  languageCode?: string;
};

export type TagLookup = {
  tagDbId: string;
  tagId: string;
  itemId: string;
  itemName: string;
  category: string | null;
  itemStatus: string;
  ownerUserId: string;
  ownerChatId: number;
};

export type OwnedItem = {
  itemId: string;
  itemName: string;
  category: string | null;
  status: string;
  tagId: string | null;
};

function normalizeDbNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  throw new Error("Unexpected numeric value from database");
}

export class PolyTagRepository {
  async healthCheck(): Promise<void> {
    const { error } = await supabase.from("app_users").select("id").limit(1);
    if (error) {
      throw new Error(
        `Supabase health check failed: ${error.message}. Did you run the schema/migration?`,
      );
    }
  }

  async upsertUser(input: TelegramUserInput): Promise<string> {
    const { data, error } = await supabase
      .from("app_users")
      .upsert(
        {
          telegram_user_id: input.telegramUserId,
          telegram_chat_id: input.telegramChatId,
          username: input.username ?? null,
          first_name: input.firstName ?? null,
          language_code: input.languageCode ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_user_id" },
      )
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Could not save Telegram user: ${error?.message ?? "unknown error"}`);
    }

    return data.id as string;
  }


  async getUserLocaleByTelegramUserId(telegramUserId: number): Promise<string | null> {
    const { data, error } = await supabase
      .from("app_users")
      .select("locale")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (error) throw new Error(`Could not read user locale: ${error.message}`);
    return (data?.locale as string | null | undefined) ?? null;
  }

  async getUserLocaleById(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("app_users")
      .select("locale")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(`Could not read user locale: ${error.message}`);
    return (data?.locale as string | null | undefined) ?? null;
  }

  async setUserLocale(input: {
    telegramUserId: number;
    locale: string;
  }): Promise<void> {
    const { error } = await supabase
      .from("app_users")
      .update({
        locale: input.locale,
        language_selected: true,
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_user_id", input.telegramUserId);

    if (error) throw new Error(`Could not update user locale: ${error.message}`);
  }

  async tagExists(tagId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("tags")
      .select("id")
      .eq("public_token", tagId)
      .maybeSingle();

    if (error) throw new Error(`Could not check tag: ${error.message}`);
    return Boolean(data);
  }

  async registerTaggedItem(
    ownerId: string,
    tagId: string,
    itemName: string,
    category: string,
  ): Promise<{ itemId: string; tagDbId: string }> {
    const { data, error } = await supabase.rpc("register_tagged_item", {
      p_owner_id: ownerId,
      p_item_name: itemName,
      p_tag_token: tagId,
      p_category: category,
    });

    if (error) {
      if (error.message.includes("TAG_ALREADY_EXISTS")) {
        throw new Error("TAG_ALREADY_EXISTS");
      }
      throw new Error(`Could not register item: ${error.message}`);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.item_id || !row?.tag_id) {
      throw new Error("Database did not return the created item/tag IDs");
    }

    await this.logEvent("ITEM_REGISTERED", {
      actorUserId: ownerId,
      itemId: row.item_id,
      tagId: row.tag_id,
      metadata: { public_token: tagId, category },
    });

    return { itemId: row.item_id, tagDbId: row.tag_id };
  }

  async getTag(tagId: string): Promise<TagLookup | null> {
    const { data: tag, error: tagError } = await supabase
      .from("tags")
      .select("id, public_token, item_id, status")
      .eq("public_token", tagId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (tagError) throw new Error(`Could not read tag: ${tagError.message}`);
    if (!tag) return null;

    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("id, name, category, owner_id, status")
      .eq("id", tag.item_id)
      .maybeSingle();

    if (itemError) throw new Error(`Could not read item: ${itemError.message}`);
    if (!item || item.status === "ARCHIVED") return null;

    const { data: owner, error: ownerError } = await supabase
      .from("app_users")
      .select("id, telegram_chat_id")
      .eq("id", item.owner_id)
      .maybeSingle();

    if (ownerError) throw new Error(`Could not read owner: ${ownerError.message}`);
    if (!owner) return null;

    return {
      tagDbId: tag.id as string,
      tagId: tag.public_token as string,
      itemId: item.id as string,
      itemName: item.name as string,
      category: (item.category as string | null) ?? null,
      itemStatus: item.status as string,
      ownerUserId: owner.id as string,
      ownerChatId: normalizeDbNumber(owner.telegram_chat_id),
    };
  }

  async listOwnedItems(ownerId: string): Promise<OwnedItem[]> {
    const { data: items, error } = await supabase
      .from("items")
      .select("id, name, category, status")
      .eq("owner_id", ownerId)
      .neq("status", "ARCHIVED")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(`Could not read your items: ${error.message}`);
    if (!items?.length) return [];

    const itemIds = items.map((item) => item.id as string);
    const { data: tags, error: tagError } = await supabase
      .from("tags")
      .select("item_id, public_token")
      .in("item_id", itemIds)
      .eq("status", "ACTIVE");

    if (tagError) throw new Error(`Could not read item tags: ${tagError.message}`);

    const tagByItem = new Map<string, string>();
    for (const tag of tags ?? []) {
      tagByItem.set(tag.item_id as string, tag.public_token as string);
    }

    return items.map((item) => ({
      itemId: item.id as string,
      itemName: item.name as string,
      category: (item.category as string | null) ?? null,
      status: item.status as string,
      tagId: tagByItem.get(item.id as string) ?? null,
    }));
  }

  async reportItemLost(input: {
    ownerId: string;
    itemId: string;
    lastSeenText: string;
  }): Promise<{ reportId: string }> {
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("id, owner_id, status")
      .eq("id", input.itemId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();

    if (itemError) throw new Error(`Could not read item: ${itemError.message}`);
    if (!item) throw new Error("ITEM_NOT_FOUND");

    const { error: updateError } = await supabase
      .from("items")
      .update({ status: "LOST" })
      .eq("id", input.itemId)
      .eq("owner_id", input.ownerId);

    if (updateError) throw new Error(`Could not mark item lost: ${updateError.message}`);

    const { error: closeError } = await supabase
      .from("lost_reports")
      .update({ status: "CLOSED", resolved_at: new Date().toISOString() })
      .eq("item_id", input.itemId)
      .eq("status", "OPEN");

    if (closeError) throw new Error(`Could not close previous lost reports: ${closeError.message}`);

    const { data: report, error: reportError } = await supabase
      .from("lost_reports")
      .insert({
        owner_id: input.ownerId,
        item_id: input.itemId,
        last_seen_text: input.lastSeenText,
        status: "OPEN",
      })
      .select("id")
      .single();

    if (reportError || !report) {
      throw new Error(`Could not create lost report: ${reportError?.message ?? "missing report"}`);
    }

    await this.logEvent("ITEM_REPORTED_LOST", {
      actorUserId: input.ownerId,
      itemId: input.itemId,
      metadata: {
        lost_report_id: report.id,
        last_seen_text: input.lastSeenText,
      },
    });
    return { reportId: report.id as string };
  }

  async markItemRecovered(input: {
    ownerId: string;
    itemId: string;
  }): Promise<boolean> {
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("id, owner_id")
      .eq("id", input.itemId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();

    if (itemError) throw new Error(`Could not read item: ${itemError.message}`);
    if (!item) return false;

    const { error: updateError } = await supabase
      .from("items")
      .update({ status: "RECOVERED" })
      .eq("id", input.itemId)
      .eq("owner_id", input.ownerId);

    if (updateError) throw new Error(`Could not mark item recovered: ${updateError.message}`);

    const now = new Date().toISOString();
    await supabase
      .from("lost_reports")
      .update({ status: "CLOSED", resolved_at: now })
      .eq("item_id", input.itemId)
      .eq("status", "OPEN");

    await supabase
      .from("found_reports")
      .update({ status: "CLOSED" })
      .eq("item_id", input.itemId)
      .in("status", ["OPEN", "OWNER_NOTIFIED"]);

    await this.logEvent("ITEM_RECOVERED", {
      actorUserId: input.ownerId,
      itemId: input.itemId,
    });

    return true;
  }

  async createFoundReport(input: {
    tag: TagLookup;
    finderTelegramUserId: number;
    finderTelegramChatId: number;
    message: string;
    finderLocale?: string;
  }): Promise<void> {
    const { data, error } = await supabase
      .from("found_reports")
      .insert({
        tag_id: input.tag.tagDbId,
        item_id: input.tag.itemId,
        finder_telegram_user_id: input.finderTelegramUserId,
        finder_telegram_chat_id: input.finderTelegramChatId,
        message: input.message,
        status: "OWNER_NOTIFIED",
      })
      .select("id")
      .single();

    if (error) throw new Error(`Could not save found report: ${error.message}`);

    if (input.tag.itemStatus === "LOST") {
      const { error: itemError } = await supabase
        .from("items")
        .update({ status: "FOUND" })
        .eq("id", input.tag.itemId)
        .eq("status", "LOST");

      if (itemError) {
        console.error("PolyTag item status warning:", itemError.message);
      }
    }

    await this.logEvent("FOUND_REPORT_CREATED", {
      itemId: input.tag.itemId,
      tagId: input.tag.tagDbId,
      actorTelegramUserId: input.finderTelegramUserId,
      metadata: {
        found_report_id: data.id,
        finder_locale: input.finderLocale ?? null,
      },
    });
  }

  async logTagScan(tag: TagLookup, telegramUserId: number): Promise<void> {
    await this.logEvent("TAG_SCANNED", {
      itemId: tag.itemId,
      tagId: tag.tagDbId,
      actorTelegramUserId: telegramUserId,
      metadata: { public_token: tag.tagId, item_status: tag.itemStatus },
    });
  }

  async logStickerGenerated(input: {
    ownerId: string;
    itemId: string;
    tagDbId: string;
    tagId: string;
  }): Promise<void> {
    await this.logEvent("STICKER_GENERATED", {
      actorUserId: input.ownerId,
      itemId: input.itemId,
      tagId: input.tagDbId,
      metadata: { public_token: input.tagId, formats: ["PNG", "PDF"] },
    });
  }


  async setBotState(telegramUserId: number, state: unknown): Promise<void> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("bot_states").upsert(
      {
        telegram_user_id: telegramUserId,
        state,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_user_id" },
    );

    if (error) throw new Error(`Could not save bot state: ${error.message}`);
  }

  async getBotState(telegramUserId: number): Promise<unknown | null> {
    const { data, error } = await supabase
      .from("bot_states")
      .select("state, expires_at")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (error) throw new Error(`Could not read bot state: ${error.message}`);
    if (!data) return null;

    if (data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()) {
      await this.clearBotState(telegramUserId);
      return null;
    }

    return data.state ?? null;
  }

  async clearBotState(telegramUserId: number): Promise<void> {
    const { error } = await supabase
      .from("bot_states")
      .delete()
      .eq("telegram_user_id", telegramUserId);

    if (error) throw new Error(`Could not clear bot state: ${error.message}`);
  }

  private async logEvent(
    eventType: string,
    input: {
      actorUserId?: string;
      actorTelegramUserId?: number;
      itemId?: string;
      tagId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const { error } = await supabase.from("events").insert({
      event_type: eventType,
      actor_user_id: input.actorUserId ?? null,
      actor_telegram_user_id: input.actorTelegramUserId ?? null,
      item_id: input.itemId ?? null,
      tag_id: input.tagId ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) console.error("PolyTag event log warning:", error.message);
  }
}

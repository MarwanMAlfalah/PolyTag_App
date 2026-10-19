import { InlineKeyboard } from "grammy";
import { categoryLabel, languageOptions, type Locale, t } from "../i18n/index.js";

export const itemCategories = [
  { id: "keys" },
  { id: "bag" },
  { id: "laptop" },
  { id: "phone" },
  { id: "camera" },
  { id: "card" },
  { id: "other" },
] as const;

export function homeKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text(t(locale, "registerItem"), "register")
    .text(t(locale, "myItems"), "my_items")
    .row()
    .text(t(locale, "lostSomething"), "lost_help")
    .text(t(locale, "foundSomething"), "found_help")
    .row()
    .text(t(locale, "language"), "lang_menu:home")
    .text(t(locale, "safety"), "safe:home");
}

export function categoryKeyboard(locale: Locale) {
  const keyboard = new InlineKeyboard();
  itemCategories.forEach((category, index) => {
    keyboard.text(categoryLabel(locale, category.id), `cat:${category.id}`);
    if (index % 2 === 1) keyboard.row();
  });
  return keyboard;
}

export function lostConfirmationKeyboard(locale: Locale, itemId: string) {
  return new InlineKeyboard()
    .text(t(locale, "confirmLostButton"), `lost_confirm:${itemId}`)
    .row()
    .text(t(locale, "editLostLocation"), `lost_edit:${itemId}`)
    .row()
    .text(t(locale, "cancelLostReport"), `lost_cancel:${itemId}`);
}

export function languageKeyboard(returnTo: "home" | "found", tagId?: string) {
  const keyboard = new InlineKeyboard();
  languageOptions.forEach((language, index) => {
    const callback =
      returnTo === "found" && tagId
        ? `lang:${language.id}:found:${tagId}`
        : `lang:${language.id}:home`;
    keyboard.text(language.label, callback);
    if (index % 2 === 1) keyboard.row();
  });
  return keyboard;
}

export function foundTagKeyboard(locale: Locale, tagId: string) {
  return new InlineKeyboard()
    .text(t(locale, "foundButton"), `found:${tagId}`)
    .row()
    .text(t(locale, "language"), `lang_menu:found:${tagId}`)
    .text(t(locale, "safety"), `safe:${tagId}`);
}

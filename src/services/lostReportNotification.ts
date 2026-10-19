import { categoryLabel, type Locale } from "../i18n/index.js";

const languageNames: Record<Locale, string> = {
  ru: "Russian", en: "English", ar: "Arabic", zh: "Chinese",
  vi: "Vietnamese", es: "Spanish", fr: "French",
};

// Deliberately accepts only item/report details, never an owner or Telegram profile.
export function adminLostReportMessage(input: {
  itemName: string;
  category: string | null;
  lastSeenText: string;
  tagId: string | null;
  locale: Locale;
}): string {
  return [
    "🚨 New Lost Item",
    "",
    `Item: ${input.itemName}`,
    `📂 Category: ${categoryLabel("en", input.category)}`,
    `📍 Last seen: ${input.lastSeenText}`,
    `🏷 PolyTag ID: ${input.tagId ?? "No active tag"}`,
    `🌐 Report language: ${languageNames[input.locale]}`,
    "🔴 Status: LOST",
    "",
    "The owner’s personal contact information is not shared.",
  ].join("\n");
}

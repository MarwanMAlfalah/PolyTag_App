export type UserState =
  | { type: "awaiting_item_name"; category: string }
  | { type: "awaiting_manual_found_tag_id" }
  | { type: "awaiting_finder_message"; tagId: string }
  | { type: "awaiting_lost_location"; itemId: string; itemName: string };

export const states = new Map<number, UserState>();

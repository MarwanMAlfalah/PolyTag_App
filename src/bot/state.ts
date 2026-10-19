export type LostItemState = {
  itemId: string;
  itemName: string;
  category: string | null;
  tagId: string | null;
};

export type LostConfirmationState = LostItemState & {
  type: "awaiting_lost_confirmation";
  lastSeenText: string;
};

export type UserState =
  | { type: "awaiting_item_name"; category: string }
  | { type: "awaiting_manual_found_tag_id" }
  | { type: "awaiting_finder_message"; tagId: string }
  | (LostItemState & { type: "awaiting_lost_location" })
  | LostConfirmationState;

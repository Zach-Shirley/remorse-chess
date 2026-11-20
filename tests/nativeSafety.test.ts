import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game";
import { withoutFreeText } from "../src/multiplayer/nativeSafety";
import { QUICK_CHAT_MESSAGES, type RoomSnapshot } from "../src/multiplayer/protocol";

function snapshotWith(chatTexts: string[]): RoomSnapshot {
  return {
    code: "ABC123",
    stage: "playing",
    rules: { ruleSet: "reactions" },
    game: createInitialState(),
    players: {
      white: { name: "anything a stranger typed", player: "white", connected: true, isHost: true },
      black: null
    },
    rematchVotes: [],
    chat: chatTexts.map((text, index) => ({ id: String(index), player: "white", text, sentAt: index })),
    disconnectDeadlines: { white: null, black: null },
    revision: 1
  };
}

describe("free-text filter", () => {
  it("keeps quick-chat phrases and drops free-form chat", () => {
    const filtered = withoutFreeText(snapshotWith([QUICK_CHAT_MESSAGES[0], "free text from the web", QUICK_CHAT_MESSAGES[1]]));
    expect(filtered.chat.map((message) => message.text)).toEqual([QUICK_CHAT_MESSAGES[0], QUICK_CHAT_MESSAGES[1]]);
  });

  it("replaces typed display names with seat names and keeps empty seats empty", () => {
    const filtered = withoutFreeText(snapshotWith([]));
    expect(filtered.players.white?.name).toBe("White player");
    expect(filtered.players.white?.connected).toBe(true);
    expect(filtered.players.black).toBeNull();
  });

  it("keeps generated display names", () => {
    const snapshot = snapshotWith([]);
    snapshot.players.white = { ...snapshot.players.white!, name: "SwiftFalcon27" };
    expect(withoutFreeText(snapshot).players.white?.name).toBe("SwiftFalcon27");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createGameServer } from "../server/game-server";
import { getLegalMoves } from "../src/game";
import type {
  ClientToServerEvents,
  CreateRoomPayload,
  JoinRoomPayload,
  MatchmakingPayload,
  PlayerSession,
  QueueResult,
  RoomConnection,
  RoomSnapshot,
  ServerResponse,
  ServerToClientEvents
} from "../src/multiplayer/protocol";

type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;
type GameServer = ReturnType<typeof createGameServer>;

describe("multiplayer game server", () => {
  let gameServer: GameServer;
  let serverUrl: string;
  let clients: TestClient[];

  beforeEach(async () => {
    gameServer = createGameServer();
    const port = await gameServer.listen(0);
    serverUrl = `http://127.0.0.1:${port}`;
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) client.close();
    await gameServer.close();
  });

  async function newClient() {
    const client = createClient(serverUrl, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false
    }) as TestClient;
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    return client;
  }

  it("creates a private room, joins it, and synchronizes an authoritative move", async () => {
    const whiteClient = await newClient();
    const blackClient = await newClient();
    const whiteConnection = await createRoom(whiteClient, {
      name: "SwiftFalcon27",
      rules: {}
    });
    const whiteJoinedState = waitForState(
      whiteClient,
      (state) => state.players.black?.name === "BraveOtter42"
    );
    const blackConnection = await joinRoom(blackClient, {
      name: "BraveOtter42",
      code: whiteConnection.snapshot.code
    });

    expect(blackConnection.snapshot.stage).toBe("playing");
    expect((await whiteJoinedState).players.black?.connected).toBe(true);

    const initialMove = getLegalMoves(blackConnection.snapshot.game)[0];
    const rejected = await move(blackClient, initialMove.id);
    expect(rejected).toEqual({ ok: false, message: "It is not your turn." });

    const whiteUpdated = waitForState(whiteClient, (state) => state.game.moveLog.length === 1);
    const blackUpdated = waitForState(blackClient, (state) => state.game.moveLog.length === 1);
    expect(await move(whiteClient, initialMove.id)).toEqual({ ok: true, data: null });

    const [whiteState, blackState] = await Promise.all([whiteUpdated, blackUpdated]);
    expect(whiteState.game).toEqual(blackState.game);
    expect(whiteState.game.currentPlayer).toBe("black");
  });

  it("restores a disconnected seat with its reconnect token", async () => {
    const whiteClient = await newClient();
    const blackClient = await newClient();
    const whiteConnection = await createRoom(whiteClient, {
      name: "Host",
      rules: {}
    });
    const blackConnection = await joinRoom(blackClient, {
      name: "Guest",
      code: whiteConnection.snapshot.code
    });

    const disconnectedState = waitForState(
      whiteClient,
      (state) => state.players.black?.connected === false
    );
    blackClient.close();
    const disconnected = await disconnectedState;
    expect(disconnected.disconnectDeadlines.black).not.toBeNull();

    const legalMove = getLegalMoves(blackConnection.snapshot.game)[0];
    expect(await move(whiteClient, legalMove.id)).toEqual({
      ok: false,
      message: "Wait for your opponent to reconnect."
    });

    const resumedClient = await newClient();
    const whiteReconnectedState = waitForState(
      whiteClient,
      (state) => state.players.black?.connected === true
    );
    const resumed = await resumeRoom(resumedClient, blackConnection.session);
    expect(resumed.snapshot.players.black?.name).toBe("Guest");
    expect((await whiteReconnectedState).players.black?.connected).toBe(true);
    expect(resumed.snapshot.disconnectDeadlines.black).toBeNull();
    expect(await move(whiteClient, legalMove.id)).toEqual({ ok: true, data: null });
  });

  it("ends the game by resignation when a disconnected player misses the grace period", async () => {
    await gameServer.close();
    gameServer = createGameServer(undefined, { disconnectGraceMs: 60 });
    const port = await gameServer.listen(0);
    serverUrl = `http://127.0.0.1:${port}`;

    const whiteClient = await newClient();
    const blackClient = await newClient();
    const room = await createRoom(whiteClient, {
      name: "White",
      rules: {}
    });
    await joinRoom(blackClient, { name: "Black", code: room.snapshot.code });

    const pausedState = waitForState(
      whiteClient,
      (state) => state.disconnectDeadlines.black !== null
    );
    const finishedState = waitForState(whiteClient, (state) => state.stage === "finished");
    blackClient.close();

    const paused = await pausedState;
    expect(paused.game.status.phase).toBe("playing");
    expect(paused.disconnectDeadlines.black).toBeGreaterThan(Date.now());

    const finished = await finishedState;
    expect(finished.disconnectDeadlines.black).toBeNull();
    expect(finished.game.status).toMatchObject({
      phase: "won",
      winner: "white",
      reason: "resignation"
    });
  });

  it("records resignation and starts a rematch after both players accept", async () => {
    const whiteClient = await newClient();
    const blackClient = await newClient();
    const room = await createRoom(whiteClient, {
      name: "White",
      rules: {}
    });
    await joinRoom(blackClient, { name: "Black", code: room.snapshot.code });

    const finishedState = waitForState(whiteClient, (state) => state.stage === "finished");
    expect(await resign(whiteClient)).toEqual({ ok: true, data: null });
    const finished = await finishedState;
    expect(finished.game.status).toMatchObject({
      phase: "won",
      winner: "black",
      reason: "resignation"
    });

    const requestedState = waitForState(
      blackClient,
      (state) => state.rematchVotes.includes("white")
    );
    expect(await rematch(whiteClient)).toEqual({ ok: true, data: null });
    expect((await requestedState).rematchVotes).toEqual(["white"]);
    const restartedState = waitForState(
      whiteClient,
      (state) => state.stage === "playing" && state.rematchVotes.length === 0
    );
    expect(await rematch(blackClient)).toEqual({ ok: true, data: null });
    const restarted = await restartedState;
    expect(restarted.game.moveLog).toHaveLength(0);
    expect(restarted.game.currentPlayer).toBe("white");
  });

  it("shows only generated names and keeps player IDs private", async () => {
    const whiteClient = await newClient();
    const blackClient = await newClient();
    const room = await createRoom(whiteClient, {
      name: "anything typed",
      playerId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      rules: {}
    });
    const joined = await joinRoom(blackClient, { name: "CalmHeron31", code: room.snapshot.code });

    expect(joined.snapshot.players.white?.name).toBe("Guest");
    expect(joined.snapshot.players.black?.name).toBe("CalmHeron31");
    expect(JSON.stringify(joined.snapshot)).not.toContain("1b9d6bcd");
  });

  it("synchronizes quick-message chat and rejects free text", async () => {
    const whiteClient = await newClient();
    const blackClient = await newClient();
    const room = await createRoom(whiteClient, {
      name: "White",
      rules: {}
    });
    await joinRoom(blackClient, { name: "Black", code: room.snapshot.code });

    const whiteChatState = waitForState(whiteClient, (state) => state.chat.length === 1);
    const blackChatState = waitForState(blackClient, (state) => state.chat.length === 1);
    expect(await sendChat(whiteClient, "  Good   luck!  ")).toEqual({ ok: true, data: null });

    const [whiteState, blackState] = await Promise.all([whiteChatState, blackChatState]);
    expect(whiteState.chat).toEqual(blackState.chat);
    expect(whiteState.chat[0]).toMatchObject({
      player: "white",
      text: "Good luck!"
    });
    expect(await sendChat(blackClient, "anything a stranger might type")).toEqual({
      ok: false,
      message: "Choose one of the quick messages."
    });
    expect(await sendChat(blackClient, "   ")).toEqual({
      ok: false,
      message: "Choose one of the quick messages."
    });
  });

  it("records an active departure and prevents an orphaned rematch request", async () => {
    const whiteClient = await newClient();
    const blackClient = await newClient();
    const room = await createRoom(whiteClient, {
      name: "White",
      rules: {}
    });
    await joinRoom(blackClient, { name: "Black", code: room.snapshot.code });

    const departedState = waitForState(
      whiteClient,
      (state) => state.stage === "finished" && state.players.black?.connected === false
    );
    expect(await leaveRoom(blackClient)).toEqual({ ok: true, data: null });
    const departed = await departedState;
    expect(departed.game.status).toMatchObject({
      phase: "won",
      winner: "white",
      reason: "resignation"
    });
    expect(await rematch(whiteClient)).toEqual({
      ok: false,
      message: "Your opponent is no longer in the room."
    });
  });

  it("pairs two compatible quick-match clients", async () => {
    const firstClient = await newClient();
    const secondClient = await newClient();
    const payload: MatchmakingPayload = {
      name: "Queued White",
      rules: {}
    };

    expect(await joinMatchmaking(firstClient, payload)).toEqual({
      ok: true,
      data: { queued: true }
    });

    const firstMatched = waitForMatch(firstClient);
    const secondMatched = waitForMatch(secondClient);
    expect(await joinMatchmaking(secondClient, { ...payload, name: "Queued Black" })).toEqual({
      ok: true,
      data: { queued: false }
    });

    const [first, second] = await Promise.all([firstMatched, secondMatched]);
    expect(first.snapshot.code).toBe(second.snapshot.code);
    // Colors are random, but the two players always get opposite ones.
    expect([first.session.player, second.session.player].sort()).toEqual(["black", "white"]);
  });

  it("lets the room creator choose Black and seats the joiner as White", async () => {
    const hostClient = await newClient();
    const guestClient = await newClient();
    const room = await createRoom(hostClient, {
      name: "CalmHeron31",
      rules: {},
      color: "black"
    });
    expect(room.session.player).toBe("black");

    const joined = await joinRoom(guestClient, { name: "BoldOtter12", code: room.snapshot.code });
    expect(joined.session.player).toBe("white");
    expect(joined.snapshot.stage).toBe("playing");
    // White always moves first.
    expect(joined.snapshot.game.currentPlayer).toBe("white");
    expect(await joinRoom(await newClient(), { name: "WiseLynx44", code: room.snapshot.code }).catch((error: Error) => error.message)).toBe(
      "That room is already full."
    );
  });
});

function createRoom(client: TestClient, payload: CreateRoomPayload) {
  return emitWithAck<RoomConnection>((ack) => client.emit("room:create", payload, ack));
}

function joinRoom(client: TestClient, payload: JoinRoomPayload) {
  return emitWithAck<RoomConnection>((ack) => client.emit("room:join", payload, ack));
}

function resumeRoom(client: TestClient, session: PlayerSession) {
  return emitWithAck<RoomConnection>((ack) => client.emit("room:resume", session, ack));
}

function move(client: TestClient, moveId: string) {
  return emitResponse<null>((ack) => client.emit("room:move", moveId, ack));
}

function resign(client: TestClient) {
  return emitResponse<null>((ack) => client.emit("room:resign", ack));
}

function rematch(client: TestClient) {
  return emitResponse<null>((ack) => client.emit("room:rematch", ack));
}

function sendChat(client: TestClient, message: string) {
  return emitResponse<null>((ack) => client.emit("room:chat", message, ack));
}

function leaveRoom(client: TestClient) {
  return emitResponse<null>((ack) => client.emit("room:leave", ack));
}

function joinMatchmaking(client: TestClient, payload: MatchmakingPayload) {
  return emitResponse<QueueResult>((ack) => client.emit("matchmaking:join", payload, ack));
}

function emitWithAck<T>(emit: (ack: (response: ServerResponse<T>) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    emit((response) => response.ok ? resolve(response.data) : reject(new Error(response.message)));
  });
}

function emitResponse<T>(emit: (ack: (response: ServerResponse<T>) => void) => void) {
  return new Promise<ServerResponse<T>>((resolve) => emit(resolve));
}

function waitForState(client: TestClient, predicate: (state: RoomSnapshot) => boolean) {
  return new Promise<RoomSnapshot>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off("room:state", handler);
      reject(new Error("Timed out waiting for room state."));
    }, 2_000);
    const handler = (state: RoomSnapshot) => {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      client.off("room:state", handler);
      resolve(state);
    };
    client.on("room:state", handler);
  });
}

function waitForMatch(client: TestClient) {
  return new Promise<RoomConnection>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for a match.")), 2_000);
    client.once("matchmaking:matched", (connection) => {
      clearTimeout(timeout);
      resolve(connection);
    });
  });
}

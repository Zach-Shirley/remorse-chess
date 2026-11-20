# [GAME NAME] Store Listing (template)

_Template. Replace every bracketed field and the description before submitting._

| Field | Draft |
|---|---|
| Name (30 chars) | [GAME NAME] |
| Subtitle, iOS (30 chars) | [SUBTITLE] |
| Short description, Google (80 chars) | [SHORT DESCRIPTION] |
| Category | Games → Board |
| Age rating | 4+ / Everyone (no free-form chat or user-generated text in the app build) |
| Price | Free, no in-app purchases |
| Privacy label (iOS) | Data Not Collected. The random player ID only lives in server memory for the length of a room. Once ratings store it, declare "Identifiers → User ID", not linked to identity |
| Data safety (Google) | No data collected or shared |
| Privacy policy URL | [LLC SITE]/[GAME SLUG]/privacy |
| Support URL | [LLC SITE]/[GAME SLUG]/support |

## Description

[ONE PARAGRAPH: what the game is and what makes it different.]

- Play the bot on Easy, Medium or Hard, even offline
- Pass & Play on one phone
- Online play with private room codes or quick match, and a bot to play while you wait
- [GAME-SPECIFIC FEATURES]
- No accounts, no ads, no tracking

## Review notes for Apple

No sign-in is needed. Online play connects to a game server that may take up to a minute to wake on the first connection. To test online play with one device, start a private room, then open the website ([WEB URL]/multiplayer) in a browser and join with the room code.

## Still to do

- Screenshots (iPhone 6.9", 1320×2868): `node scripts/store-screenshots.mjs` then `node scripts/frame-screenshots.mjs` writes them to `screenshots/framed/`. The same images work for Google Play.
- Google feature graphic (1024×500)
- Icon: `npm run mobile:icons` builds it from `art/piece-icon.png`

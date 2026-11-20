# Remorse Chess Store Listing (draft)

_Draft. Nothing has been submitted. Fields still in brackets depend on decisions not yet made (the publisher's site, the live web address)._

| Field | Draft |
|---|---|
| Name (30 chars) | Remorse Chess |
| Subtitle, iOS (30 chars) | Chess with a conscience |
| Short description, Google (80 chars) | Chess where every capture weighs on the piece that made it. Roll for remorse. |
| Category | Games → Board |
| Age rating | 4+ / Everyone (no free-form chat or user-generated text in the app build) |
| Price | Free, no in-app purchases |
| Privacy label (iOS) | Data Not Collected. The random player ID only lives in server memory for the length of a room. Once ratings store it, declare "Identifiers → User ID", not linked to identity |
| Data safety (Google) | No data collected or shared |
| Privacy policy URL | [LLC SITE]/remorse-chess/privacy |
| Support URL | [LLC SITE]/remorse-chess/support |

## Description

Remorse Chess is chess where the pieces have a conscience. A piece that captures may be left guilt-ridden and refuse to capture again until a bishop absolves it; it may freeze in despair and need rescuing within three turns; it may feel nothing; or it may get a taste for it and start taking its own side. A die decides, once, for each piece. The variant was created by Bardelo Bardalini and published in his YouTube Shorts; this app is an independent implementation.

- Play the bot on Easy, Medium or Hard, even offline
- Pass & Play on one phone
- Online play with private room codes or quick match, and a bot to play while you wait
- Three rule sets: Classic (no dice), Reactions, and Witnesses (bystanders react too)
- Every die roll shown and logged; every status readable on the board
- The full rules in the app, with the creator's videos linked and this app's own rulings listed separately
- No accounts, no ads, no tracking

## Review notes for Apple

No sign-in is needed. Online play connects to a game server that may take up to a minute to wake on the first connection. To test online play with one device, start a private room, then open the website ([WEB URL]/multiplayer) in a browser and join with the room code.

## Still to do

- Screenshots (iPhone 6.9", 1320×2868): `node scripts/store-screenshots.mjs` then `node scripts/frame-screenshots.mjs` writes them to `screenshots/framed/`. The same images work for Google Play.
- Google feature graphic (1024×500)
- Icon: `npm run mobile:icons` builds it from `art/piece-icon.png`

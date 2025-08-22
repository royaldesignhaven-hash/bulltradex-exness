# BullTradeX — WebSocket OHLC Aggregator + Frontend (Render/GH deploy)

Ye repo aik ready-to-run package hai jo aapke Exness/bridge WebSocket se ticks lega,
unko OHLC candles me aggregate karega (M1, M5, M15, H1), aur front-end ko /history
endpoint pe real-time candles dega.

USAGE (local):
1. Extract zip.
2. `npm install`
3. Copy `.env.example` to `.env` and edit:
   - Set EXNESS_WS_URL to your WS/bridge URL.
   - Optionally set EXNESS_WS_AUTH_JSON to the JSON string your feed needs to subscribe/authenticate.
4. `npm start`
5. Open http://localhost:8080 and press Generate Signal.

DEPLOY:
- Push to GitHub, then deploy on Render.com (New → Web Service).
- Set environment variables in Render dashboard (EXNESS_WS_URL, EXNESS_WS_AUTH_JSON).

SECURITY:
- **Do not paste credentials in chat.** Put them only in your `.env` or hosting env vars.
- If you don't have a WS feed yet, server will run but /history will return empty until ticks arrive.

import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import WebSocket from "ws";
import compression from "compression";
import cors from "cors";

dotenv.config();
const PORT = process.env.PORT || 8080;
const WS_URL = process.env.EXNESS_WS_URL || "";
const WS_AUTH_JSON = process.env.EXNESS_WS_AUTH_JSON || ""; // optional subscribe/auth json

const TF_SECONDS = { "M1":60, "M5":300, "M15":900, "H1":3600 };

const app = express();
app.use(compression());
app.use(cors());
app.use(morgan("tiny"));

// in-memory store
const candles = {}; // candles[symbol][tf] = [{ts,o,h,l,c},...]
const active = {};  // active[symbol][tf] = {startTs, open, high, low, close}

// ensure structures exist
function ensureSymbol(symbol){
  if(!candles[symbol]) candles[symbol] = {};
  if(!active[symbol]) active[symbol] = {};
  for(const tf of Object.keys(TF_SECONDS)){
    if(!candles[symbol][tf]) candles[symbol][tf] = [];
    if(!active[symbol][tf]) active[symbol][tf] = null;
  }
}

// process one tick-like object: {symbol, price, tsMs}
function processTick(tick){
  const symbol = String(tick.symbol).toUpperCase();
  const price = Number(tick.price);
  const tsMs = Number(tick.tsMs);
  if(!isFinite(price) || !isFinite(tsMs)) return;
  ensureSymbol(symbol);
  for(const [tf,sec] of Object.entries(TF_SECONDS)){
    const periodStart = Math.floor(tsMs/1000/sec)*sec; // epoch sec
    const a = active[symbol][tf];
    if(!a || a.startTs !== periodStart){
      if(a){
        candles[symbol][tf].push({ts:a.startTs, o:a.open, h:a.high, l:a.low, c:a.close});
        if(candles[symbol][tf].length > 3000) candles[symbol][tf].shift();
      }
      active[symbol][tf] = {startTs:periodStart, open:price, high:price, low:price, close:price};
    }else{
      a.high = Math.max(a.high, price);
      a.low = Math.min(a.low, price);
      a.close = price;
    }
  }
}

// parse incoming WS message to {symbol, price, tsMs}
// Modify parseTick to match your Exness/bridge feed format.
function parseTick(raw){
  let obj = raw;
  if(typeof raw === "string"){
    try { obj = JSON.parse(raw); } catch(e){ return null; }
  }
  // Common shapes covered:
  // {symbol:'EURUSD', price:1.2345, timestamp:1690000000000}
  if(obj.symbol && (obj.price || obj.p) && (obj.timestamp || obj.t)){
    const symbol = obj.symbol || obj.s;
    const price = ('price' in obj) ? obj.price : obj.p;
    const ts = ('timestamp' in obj) ? obj.timestamp : obj.t;
    const tsMs = (ts && ts < 1e12) ? ts*1000 : ts;
    return {symbol, price, tsMs};
  }
  // shape: array ticks e.g. [{s,p,t},...]
  if(Array.isArray(obj)){
    // not handled here
    return null;
  }
  return null;
}

// connect to WS feed if provided
let ws = null;
function connectWS(){
  if(!WS_URL){
    console.warn("[ws] EXNESS_WS_URL not set — server will serve /history with no live feed.");
    return;
  }
  ws = new WebSocket(WS_URL);
  ws.on("open", ()=>{
    console.log("[ws] connected to", WS_URL);
    if(WS_AUTH_JSON){
      try{
        const j = JSON.parse(WS_AUTH_JSON);
        ws.send(JSON.stringify(j));
        console.log("[ws] sent auth/subscribe JSON");
      }catch(e){ console.warn("[ws] EXNESS_WS_AUTH_JSON parse error"); }
    }
  });
  ws.on("message", (msg)=>{
    const tick = parseTick(msg.toString());
    if(tick) processTick(tick);
  });
  ws.on("close", (code, reason)=>{
    console.warn("[ws] closed", code, reason, "reconnecting in 3s");
    setTimeout(connectWS, 3000);
  });
  ws.on("error", (err)=>{
    console.error("[ws] error", err && err.message);
  });
}

app.get("/history", (req, res)=>{
  try{
    const symbol = String(req.query.symbol || "EURUSD").toUpperCase();
    const tf = String(req.query.tf || "M5").toUpperCase();
    const limit = Math.max(10, Math.min(2000, parseInt(req.query.limit || "1000", 10)));
    ensureSymbol(symbol);
    const list = (candles[symbol] && candles[symbol][tf]) ? candles[symbol][tf].slice() : [];
    const a = active[symbol][tf];
    if(a) list.push({ts: a.startTs, o:a.open, h:a.high, l:a.low, c:a.close});
    const slice = list.slice(-limit);
    const out = slice.map(x=>[x.ts, +x.o, +x.h, +x.l, +x.c]);
    res.json(out);
  }catch(err){
    console.error(err);
    res.status(500).json({error:"history_error"});
  }
});

app.get("/healthz", (req,res)=>res.json({ok:true, time: Date.now()}));

app.use(express.static("public"));
app.get("/", (req,res)=> res.sendFile(process.cwd()+"/public/index.html"));

connectWS();
app.listen(PORT, ()=> console.log("OHLC proxy running on port", PORT));

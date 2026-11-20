// Servidor online de Mexican Rage: salas de 2 jugadores y reenvío de mensajes.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const ALLOWED = ['memitheduck.mx', 'www.memitheduck.mx', 'localhost', '127.0.0.1'];

const rooms = new Map();   // codigo -> [host, invitado]
let waiting = null;        // jugador esperando partida rápida

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end('Mexican Rage online OK · salas: ' + rooms.size);
});

const wss = new WebSocketServer({
  server,
  verifyClient: ({ origin }) => {
    if (!origin) return true;
    try { return ALLOWED.includes(new URL(origin).hostname); } catch (e) { return false; }
  }
});

const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const newCode = () => { let c; do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms.has(c)); return c; };

function pair(a, b, code) {
  rooms.set(code, [a, b]);
  a.room = code; a.side = 0; b.room = code; b.side = 1;
  send(a, { t: 'start', code, side: 0 });
  send(b, { t: 'start', code, side: 1 });
}

function leave(ws) {
  if (waiting === ws) waiting = null;
  const code = ws.room; if (!code) return;
  const r = rooms.get(code);
  if (r) { r.forEach(p => { if (p && p !== ws) { send(p, { t: 'left' }); p.room = null; } }); rooms.delete(code); }
  ws.room = null;
}

wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data, isBinary) => {
    let m = null;
    if (!isBinary) { try { m = JSON.parse(data.toString()); } catch (e) { m = null; } }
    if (m && m.t === 'create') { leave(ws); const code = newCode(); rooms.set(code, [ws, null]); ws.room = code; ws.side = 0; send(ws, { t: 'room', code }); return; }
    if (m && m.t === 'join') {
      leave(ws); const code = String(m.code || '').toUpperCase(), r = rooms.get(code);
      if (!r || r[1]) { send(ws, { t: 'error', msg: r ? 'SALA LLENA' : 'NO EXISTE ESA SALA' }); return; }
      pair(r[0], ws, code); return;
    }
    if (m && m.t === 'quick') {
      leave(ws);
      if (waiting && waiting !== ws && waiting.readyState === 1) { const other = waiting; waiting = null; pair(other, ws, newCode()); }
      else { waiting = ws; send(ws, { t: 'waiting' }); }
      return;
    }
    if (m && m.t === 'leave') { leave(ws); return; }
    if (m && m.t === 'ping') { send(ws, { t: 'pong', at: m.at }); return; }
    // cualquier otro mensaje se reenvía al rival tal cual
    const r = ws.room && rooms.get(ws.room); if (!r) return;
    const other = r[ws.side === 0 ? 1 : 0];
    if (other && other.readyState === 1) other.send(data, { binary: isBinary });
  });
  ws.on('close', () => leave(ws));
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); });
}, 30000);

server.listen(PORT, () => console.log('Mexican Rage online escuchando en ' + PORT));

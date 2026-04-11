const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());

// ── Config ───────────────────────────────────────────────
const WA_GROUP_NAME = 'PJ Pertemuan Kedua RAVEN dan Kerjasama Darmajaya';
const CTFD_URL      = process.env.CTFD_URL;
const CTFD_TOKEN    = process.env.CTFD_TOKEN;

// ── Persistent state ─────────────────────────────────────
const STATE_FILE = './firstbloods.json';
let firstBloods;
try {
  firstBloods = new Set(JSON.parse(fs.readFileSync(STATE_FILE)));
} catch {
  firstBloods = new Set();
}

// ── Simpan QR sementara ──────────────────────────────────
let lastQR = null;

// ── Chromium path ────────────────────────────────────────
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
console.log('🔍 Menggunakan Chromium:', CHROMIUM_PATH);

// ── WhatsApp Client ──────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ]
  }
});

client.on('qr', async qr => {
  lastQR = qr;
  console.log('📱 QR ready! Buka /qr di browser untuk scan');
  await QRCode.toFile('./qr.png', qr);
});

client.on('ready', () => {
  lastQR = null;
  console.log('✅ WhatsApp siap!');
  startPolling();
});

client.on('disconnected', reason => {
  console.log('❌ WhatsApp disconnect:', reason);
});

// ── Kirim pesan ke grup ──────────────────────────────────
async function sendToGroup(message) {
  const chats = await client.getChats();
  const group = chats.find(c => c.isGroup && c.name === WA_GROUP_NAME);
  if (!group) return console.error('Grup tidak ditemukan!');
  await group.sendMessage(message);
}

// ── Polling CTFd ─────────────────────────────────────────
async function checkFirstBloods() {
  try {
    const res = await axios.get(`${CTFD_URL}/api/v1/submissions?type=correct&per_page=100`, {
      headers: { Authorization: `Token ${CTFD_TOKEN}` }
    });

    const submissions = res.data.data;

    const firstByChall = {};
    for (const sub of submissions) {
      const cid = sub.challenge_id;
      if (!firstByChall[cid] || sub.id < firstByChall[cid].id) {
        firstByChall[cid] = sub;
      }
    }

    for (const [challId, sub] of Object.entries(firstByChall)) {
      if (firstBloods.has(challId)) continue;

      const challRes = await axios.get(`${CTFD_URL}/api/v1/challenges/${challId}`, {
        headers: { Authorization: `Token ${CTFD_TOKEN}` }
      });
      const chall = challRes.data.data;

      const userRes = await axios.get(`${CTFD_URL}/api/v1/users/${sub.user_id}`, {
        headers: { Authorization: `Token ${CTFD_TOKEN}` }
      });
      const user = userRes.data.data;

      firstBloods.add(challId);
      fs.writeFileSync(STATE_FILE, JSON.stringify([...firstBloods]));

      const msg = [
        `🩸 *FIRST BLOOD!* 🩸`,
        ``,
  setInterval(checkFirstBloods, 30_000);
}

// ── Endpoints ────────────────────────────────────────────
app.get('/', (_, res) => res.send('Bot aktif!'));

app.get('/qr', async (req, res) => {
  if (!lastQR) {
    return res.send(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;margin-top:50px">
          <h2>QR tidak tersedia</h2>
          <p>Bot sudah login atau QR belum siap.</p>
          <a href="/qr">🔄 Refresh</a>
        </body>
      </html>
    `);
  }
  const qrImage = await QRCode.toDataURL(lastQR);
  res.send(`
    <html>
      <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;margin-top:30px">
        <h2>📱 Scan QR dengan WhatsApp</h2>
        <img src="${qrImage}" style="width:300px;height:300px"/>
        <p>QR expired tiap 20 detik</p>
        <a href="/qr">🔄 Refresh QR</a>
      </body>
    </html>

  `);
});

app.post('/webhook', async (req, res) => {
  const { type, data } = req.body;
  if (type === 'solve' && data?.first_blood) {
    const msg = `🩸 *FIRST BLOOD!*\n👤 ${data.user}\n📌 ${data.challenge}\n⭐ ${data.points} pts`;
    await sendToGroup(msg);
  }
  res.json({ ok: true });
});

// ── Start ────────────────────────────────────────────────
app.listen(3000, () => console.log('Server jalan di port 3000'));
client.initialize();

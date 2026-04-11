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
console.log('Menggunakan Chromium:', CHROMIUM_PATH);

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
      '--single-process'
    ]
  }
});

client.on('qr', async function(qr) {
  lastQR = qr;
  console.log('QR ready! Buka /qr di browser untuk scan');
  await QRCode.toFile('./qr.png', qr);
});

client.on('ready', function() {
  lastQR = null;
  console.log('WhatsApp siap!');
  startPolling();
});

client.on('disconnected', function(reason) {
  console.log('WhatsApp disconnect:', reason);
});

// ── Kirim pesan ke grup ──────────────────────────────────
async function sendToGroup(message) {
  const chats = await client.getChats();
  const group = chats.find(function(c) {
    return c.isGroup && c.name === WA_GROUP_NAME;
  });
  if (!group) {
    console.error('Grup tidak ditemukan! Cek nama grup.');
    return;
  }
  await group.sendMessage(message);
}

// ── Polling CTFd ─────────────────────────────────────────
async function checkFirstBloods() {
  try {
    console.log('Polling CTFd...');
    const res = await axios.get(CTFD_URL + '/api/v1/submissions?type=correct&per_page=100', {
      headers: { Authorization: 'Token ' + CTFD_TOKEN }
    });

    const submissions = res.data.data;

    if (!submissions || submissions.length === 0) {
      console.log('Belum ada submission.');
      return;
    }

    console.log('Total submissions:', submissions.length);

    // Ambil submission pertama per challenge
    const firstByChall = {};
    for (let i = 0; i < submissions.length; i++) {
      const sub = submissions[i];
      const cid = sub.challenge_id;
      if (!firstByChall[cid] || sub.id < firstByChall[cid].id) {
        firstByChall[cid] = sub;
      }
    }

    const challIds = Object.keys(firstByChall);
    for (let i = 0; i < challIds.length; i++) {
      const challId = challIds[i];
      const sub = firstByChall[challId];

      if (firstBloods.has(String(challId))) {
        console.log('Sudah diumumin, skip:', challId);
        continue;
      }

      // Pakai data langsung dari response submission
      const userName    = sub.user.name;
      const challName   = sub.challenge.name;
      const challCat    = sub.challenge.category;
      const challPoints = sub.challenge.value;

      firstBloods.add(String(challId));
      fs.writeFileSync(STATE_FILE, JSON.stringify(Array.from(firstBloods)));

      const msg =
        '🩸 *FIRST BLOOD!* 🩸\n\n' +
        '🏆 *' + userName + '* berhasil solve pertama!\n' +
        '📌 Challenge: *' + challName + '*\n' +
        '📂 Kategori: ' + challCat + '\n' +
        '⭐ Points: ' + challPoints + '\n\n' +
        'GG! Siapa berikutnya? 🔥';

      await sendToGroup(msg);
      console.log('Announced: ' + challName + ' by ' + userName);
    }
  } catch (err) {
    console.error('Error polling CTFd:', err.message);
  }
}

function startPolling() {
  checkFirstBloods();
  setInterval(checkFirstBloods, 30000);
}

// ── Endpoints ────────────────────────────────────────────
app.get('/', function(req, res) {
  res.send('Bot aktif!');
});

app.get('/qr', async function(req, res) {
  if (!lastQR) {
    res.send('<html><body style="text-align:center;font-family:sans-serif;margin-top:50px"><h2>QR tidak tersedia</h2><p>Bot sudah login atau QR belum siap.</p><a href="/qr">Refresh</a></body></html>');
    return;
  }
  const qrImage = await QRCode.toDataURL(lastQR);
  res.send('<html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;margin-top:30px"><h2>Scan QR dengan WhatsApp</h2><img src="' + qrImage + '" style="width:300px;height:300px"/><p>QR expired tiap 20 detik</p><a href="/qr">Refresh QR</a></body></html>');
});

app.get('/reset', function(req, res) {
  firstBloods = new Set();
  fs.writeFileSync(STATE_FILE, JSON.stringify([]));
  console.log('State direset!');
  res.send('State direset! Bot akan umumin semua first blood lagi.');
});

app.post('/webhook', async function(req, res) {
  const type = req.body.type;
  const data = req.body.data;
  if (type === 'solve' && data && data.first_blood) {
    const msg = 'FIRST BLOOD!\n' + data.user + '\n' + data.challenge + '\n' + data.points + ' pts';
    await sendToGroup(msg);
  }
  res.json({ ok: true });
});

// ── Start ────────────────────────────────────────────────
app.listen(3000, function() {
  console.log('Server jalan di port 3000');
});
client.initialize();

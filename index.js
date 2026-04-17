const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());

// ── Config ───────────────────────────────────────────────
// const WA_GROUP_NAME = 'RAVEN Community - ITERA';
const WA_GROUP_NAME = 'Coba';
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

// ── Kirim pesan ke grup ──────────────────────────────────
async function sendToGroup(message) {
    try {
        const chats = await client.getChats();
        const group = chats.find(c => c.isGroup && c.name === WA_GROUP_NAME);

        if (!group) {
            console.error('Grup tidak ditemukan! Pastikan nama persis:', WA_GROUP_NAME);
            return;
        }
        await group.sendMessage(message);
    } catch (err) {
        console.error('Gagal kirim pesan WA:', err.message);
    }
}

// ── Polling CTFd (Team Mode) ──────────────────────────────
async function checkFirstBloods() {
    try {
        console.log('Polling CTFd...');
        const res = await axios.get(`${CTFD_URL}/api/v1/submissions?type=correct&per_page=100`, {
            headers: {
                'Authorization': `Token ${CTFD_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE')) {
            console.error('Error: Token tidak valid (Response HTML)');
            return;
        }

        let submissions = res.data.data;
        if (!Array.isArray(submissions)) {
            submissions = Object.values(submissions || {});
        }

        if (!submissions || submissions.length === 0) return;

        // Cari submission ID terkecil untuk tiap Challenge ID (First Blood)
        const firstByChall = {};
        submissions.forEach(sub => {
            const cid = String(sub.challenge_id);
            if (!firstByChall[cid] || sub.id < firstByChall[cid].id) {
                firstByChall[cid] = sub;
            }
        });

        const challIds = Object.keys(firstByChall);

        for (const challId of challIds) {
            const sub = firstByChall[challId];

            if (firstBloods.has(challId)) continue;

            // LOGIKA MODE TIM: Ambil sub.team.name, jika null ambil sub.user.name
            const teamName    = sub.team ? sub.team.name : (sub.user ? sub.user.name : 'Unknown Team');
            const solverName  = sub.user ? sub.user.name : 'Unknown User';
            const challName   = sub.challenge ? sub.challenge.name : 'Unknown';
            const challCat    = sub.challenge ? sub.challenge.category : 'Unknown';
            const challPoints = sub.challenge ? sub.challenge.value : 0;

            firstBloods.add(challId);
            fs.writeFileSync(STATE_FILE, JSON.stringify(Array.from(firstBloods)));

            const msg = 
                const msg = `Congrats ${solverName} - ${teamName}!
                🔥 *FIRST BLOOD!* 🔥 on ${challName} [${challCat}] [${challPoints} pts]`;

            await sendToGroup(msg);
            console.log(`[BLOOD] ${teamName} solved ${challName}`);
        }
    } catch (err) {
        console.error('Error polling CTFd:', err.message);
    }
}

function startPolling() {
    checkFirstBloods();
    setInterval(checkFirstBloods, 3000); // Cek tiap 30 detik
}

// ── Endpoints ────────────────────────────────────────────
app.get('/', (req, res) => res.send('Bot aktif!'));

app.get('/qr', async (req, res) => {
    if (!lastQR) return res.send('QR tidak tersedia atau sudah login.');
    const qrImage = await QRCode.toDataURL(lastQR);
    res.send(`<html><body style="text-align:center;font-family:sans-serif;padding:50px">
        <h2>Scan QR WhatsApp</h2>
        <img src="${qrImage}" />
        <p>Segarkan halaman jika QR tidak muncul.</p>
    </body></html>`);
});

app.get('/reset', (req, res) => {
    firstBloods = new Set();
    fs.writeFileSync(STATE_FILE, JSON.stringify([]));
    res.send('State direset!');
});

// ── Start ────────────────────────────────────────────────
app.listen(3000, () => console.log('Server running on port 3000'));
client.initialize();


// =============================== SOLO PLAYER =========================

/*
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());

// ── Config ───────────────────────────────────────────────
const WA_GROUP_NAME = 'PJ Pertemuan Kedua RAVEN dan Kerjasama Damarjaya';
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

  // Log semua grup yang ditemukan untuk debug
  const groups = chats.filter(function(c) { return c.isGroup; });
  console.log('Grup yang ditemukan:', groups.map(function(g) { return g.name; }));

  const group = groups.find(function(c) {
    return c.name === WA_GROUP_NAME;
  });

  if (!group) {
    console.error('Grup tidak ditemukan! Nama grup di WA harus persis:', WA_GROUP_NAME);
    return;
  }
  await group.sendMessage(message);
}

// ── Polling CTFd ─────────────────────────────────────────
async function checkFirstBloods() {
  try {
    console.log('Polling CTFd...');
    const res = await axios.get(CTFD_URL + '/api/v1/submissions?type=correct&per_page=100', {
      headers: {
        'Authorization': 'Token ' + CTFD_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    // Cek apakah response HTML (berarti tidak terauth)
    if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE')) {
      console.error('Response HTML! Token tidak valid atau CTFD_URL salah.');
      console.error('CTFD_URL:', CTFD_URL);
      console.error('Token ada:', !!CTFD_TOKEN);
      return;
    }

    console.log('Raw response:', JSON.stringify(res.data).slice(0, 300));

    let submissions = res.data.data;
    if (!Array.isArray(submissions)) {
      submissions = Object.values(submissions || {});
    }

    if (!submissions || submissions.length === 0) {
      console.log('Belum ada submission.');
      return;
    }

    console.log('Total submissions:', submissions.length);

    const firstByChall = {};
    for (let i = 0; i < submissions.length; i++) {
      const sub = submissions[i];
      const cid = String(sub.challenge_id);
      if (!firstByChall[cid] || sub.id < firstByChall[cid].id) {
        firstByChall[cid] = sub;
      }
    }

    const challIds = Object.keys(firstByChall);
    console.log('Challenge IDs ditemukan:', challIds);
    console.log('Sudah diumumin:', Array.from(firstBloods));

    for (let i = 0; i < challIds.length; i++) {
      const challId = challIds[i];
      const sub = firstByChall[challId];

      if (firstBloods.has(challId)) {
        console.log('Sudah diumumin, skip:', challId);
        continue;
      }

      const userName    = sub.user ? sub.user.name : 'Unknown';
      const challName   = sub.challenge ? sub.challenge.name : 'Unknown';
      const challCat    = sub.challenge ? sub.challenge.category : 'Unknown';
      const challPoints = sub.challenge ? sub.challenge.value : 0;

      firstBloods.add(challId);
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
    console.error('Detail:', err.response ? JSON.stringify(err.response.data).slice(0, 200) : 'no response');
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

app.get('/debug', async function(req, res) {
  try {
    const result = await axios.get(CTFD_URL + '/api/v1/submissions?type=correct&per_page=100', {
      headers: {
        'Authorization': 'Token ' + CTFD_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    res.json({
      ctfd_url: CTFD_URL,
      token_ada: !!CTFD_TOKEN,
      token_preview: CTFD_TOKEN ? CTFD_TOKEN.slice(0, 15) + '...' : 'KOSONG',
      response_type: typeof result.data,
      is_html: typeof result.data === 'string',
      data_preview: JSON.stringify(result.data).slice(0, 300)
    });
  } catch (err) {
    res.json({ error: err.message, ctfd_url: CTFD_URL, token_ada: !!CTFD_TOKEN });
  }
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
*/

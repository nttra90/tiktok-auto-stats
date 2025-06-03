// server.js

/**
 * Node.js + Express + Puppeteer (embedded Chromium)
 * 
 * Workflow:
 *  1. Nhận GET /api/auto?url={VIDEO_URL}
 *  2. Puppeteer mở trang TikTok, chờ 4 selector:
 *       • strong[data-e2e="like-count"]
 *       • strong[data-e2e="comment-count"]
 *       • strong[data-e2e="undefined-count"]
 *       • strong[data-e2e="share-count"]
 *  3. Lấy innerText, parse thành integer
 *  4. Trả về JSON {likes, comments, favorites, shares, raw}
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer'); // <<< Dùng puppeteer full, để nó tự tải Chromium
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Chuyển chuỗi "4.3K", "1.2M", "439" thành integer
function parseTikTokNumber(str) {
  if (!str) return null;
  str = str.trim().replace(/\./g, '').replace(/,/g, '').toUpperCase();
  if (str.endsWith('M')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? null : Math.round(num * 1_000_000);
  }
  if (str.endsWith('K')) {
    const num = parseFloat(str.slice(0, -1));
    return isNaN(num) ? null : Math.round(num * 1_000);
  }
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

app.use(cors());
app.use(express.json());

app.get('/api/auto', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Thiếu tham số url' });
  }

  let browser = null;
  try {
    // 1) Khởi Puppeteer (embedded Chromium đã tải sẵn)
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 2) Giả lập viewport đủ rộng để hiện hết các phần tử cần lấy
    await page.setViewport({ width: 1200, height: 2000 });

    // 3) Giả lập User-Agent (tránh TikTok chặn)
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/114.0.0.0 Safari/537.36'
    );

    // 4) Mở trang TikTok
    await page.goto(videoUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 5) Chờ các selector xuất hiện (15s timeout mỗi cái)
    await Promise.all([
      page.waitForSelector('strong[data-e2e="like-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="comment-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="undefined-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="share-count"]', { timeout: 15000 })
    ]);

    // 6) Lấy innerText của từng selector
    const likesText = await page.$eval(
      'strong[data-e2e="like-count"]',
      el => el.innerText || el.textContent
    );
    const commentsText = await page.$eval(
      'strong[data-e2e="comment-count"]',
      el => el.innerText || el.textContent
    );
    const favoritesText = await page.$eval(
      'strong[data-e2e="undefined-count"]',
      el => el.innerText || el.textContent
    );
    const sharesText = await page.$eval(
      'strong[data-e2e="share-count"]',
      el => el.innerText || el.textContent
    );

    // 7) Parse thành integer
    const likes = parseTikTokNumber(likesText);
    const comments = parseTikTokNumber(commentsText);
    const favorites = parseTikTokNumber(favoritesText);
    const shares = parseTikTokNumber(sharesText);

    if (
      likes === null ||
      comments === null ||
      favorites === null ||
      shares === null
    ) {
      throw new Error(
        `Không thể parse data: likes="${likesText}", comments="${commentsText}", favorites="${favoritesText}", shares="${sharesText}"`
      );
    }

    // 8) Trả về JSON
    return res.json({
      likes,
      comments,
      favorites,
      shares,
      raw: { likesText, commentsText, favoritesText, sharesText }
    });
  } catch (err) {
    console.error('❌ Lỗi khi xử lý:', err.message);
    return res.status(500).json({
      error: 'Không thể lấy dữ liệu tự động',
      details: err.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Phục vụ file index.html tại route gốc
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Khởi chạy server
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});

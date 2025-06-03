// server.js

/**
 * Node.js + Express + Puppeteer-Core
 * ================================
 * 
 * Workflow:
 *  1. Nhận GET /api/auto?url={VIDEO_URL}
 *  2. Puppeteer-Core mở trang TikTok, chờ 4 selector (like-count, comment-count, undefined-count, share-count)
 *  3. Lấy innerText → parse thành integer
 *  4. Trả về JSON {likes, comments, favorites, shares}
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * HÀM TIỆN ÍCH: Tự động dò đường dẫn Chromium
 */
function getChromeExecutable() {
  // Thêm biến môi trường override (nếu có)
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  // Thử /usr/bin/chromium-browser
  if (fs.existsSync('/usr/bin/chromium-browser')) {
    return '/usr/bin/chromium-browser';
  }
  // Thử /usr/bin/chromium
  if (fs.existsSync('/usr/bin/chromium')) {
    return '/usr/bin/chromium';
  }
  // Nếu không tìm thấy, log ra và throw
  console.error('❌ Không tìm thấy Chrome/Chromium tại /usr/bin/chromium-browser hoặc /usr/bin/chromium');
  throw new Error('Chrome/Chromium không tồn tại trên server');
}

// Hàm parse chuỗi (có “K”/“M” hoặc dấu phẩy) thành integer
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
    // 1. Tự động lấy đường dẫn Chrome/Chromium
    const chromePath = getChromeExecutable();

    // 2. Khởi Puppeteer-Core với executablePath đã tìm được
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 3. Giả lập viewport đủ rộng
    await page.setViewport({ width: 1200, height: 2000 });

    // 4. Giả lập User-Agent (tránh bị block)
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/114.0.0.0 Safari/537.36'
    );

    // 5. Mở trang TikTok
    await page.goto(videoUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 6. Chờ 4 selector xuất hiện (15s mỗi selector)
    await Promise.all([
      page.waitForSelector('strong[data-e2e="like-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="comment-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="undefined-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="share-count"]', { timeout: 15000 }),
    ]);

    // 7. Lấy innerText từng selector
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

    // 8. Parse thành số nguyên
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
        `Không thể parse: like="${likesText}", comment="${commentsText}", favorite="${favoritesText}", share="${sharesText}"`
      );
    }

    // 9. Trả JSON
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

// Phục vụ index.html tại root
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Khởi chạy server
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});

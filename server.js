// server.js

/**
 * Node.js + Express + Puppeteer
 *
 * Workflow:
 *  1. Nhận GET /api/auto?url={TikTok_URL}
 *  2. Puppeteer mở trang TikTok, chờ 4 selector xuất hiện
 *     - strong[data-e2e="like-count"]
 *     - strong[data-e2e="comment-count"]
 *     - strong[data-e2e="undefined-count"]   (là “lưu yêu thích”)
 *     - strong[data-e2e="share-count"]
 *  3. Lấy innerText của 4 thẻ này, parse thành integer
 *  4. Trả về JSON { likes, comments, favorites, shares }
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cho phép CORS
app.use(cors());
app.use(express.json());

/**
 * Chuyển chuỗi (có thể có dấu phẩy, dấu chấm, hậu tố K/M) thành integer
 */
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

app.get('/api/auto', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Thiếu tham số url' });
  }

  let browser = null;
  try {
    // 1. Khởi động Puppeteer (headless Chrome)
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 2. Giả lập viewport đủ rộng để hiện 4 số
    await page.setViewport({ width: 1200, height: 2000 });

    // 3. Giả lập User-Agent (tránh bị chặn)
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/114.0.0.0 Safari/537.36'
    );

    // 4. Mở trang TikTok
    await page.goto(videoUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 5. Chờ cho 4 selector xuất hiện (tối đa 15s mỗi selector)
    await Promise.all([
      page.waitForSelector('strong[data-e2e="like-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="comment-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="undefined-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="share-count"]', { timeout: 15000 })
    ]);

    // 6. Lấy innerText từ từng selector
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

    // 7. Parse thành số nguyên
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
        `Không thể parse đúng giá trị:
         like="${likesText}", comment="${commentsText}",
         favorite="${favoritesText}", share="${sharesText}"`
      );
    }

    // 8. Trả JSON
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

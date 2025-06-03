// server.js

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/** Bạn có thể set biến môi trường CHROME_PATH nếu path khác.
 *  Nếu không có, Puppeteer sẽ thử /usr/bin/chromium-browser và /usr/bin/chromium
 */
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/chromium-browser';

function getChromeExecutable() {
  // Nếu bạn muốn linh động, có thể kiểm tra xem file có tồn tại
  // Nhưng Render thường có sẵn /usr/bin/chromium-browser, còn /usr/bin/chromium là fallback
  if (CHROME_PATH) {
    return CHROME_PATH;
  }
  // Fallback
  return '/usr/bin/chromium-browser';
}

// (Phần parseTikTokNumber, doGet, v.v. giữ nguyên như trước...)

app.get('/api/auto', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Thiếu tham số url' });
  }

  let browser = null;
  try {
    // 1. Khởi động Puppeteer-Core, trỏ đến Chromium có sẵn
    browser = await puppeteer.launch({
      headless: true,
      executablePath: getChromeExecutable(),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 2. Giả lập viewport đủ rộng
    await page.setViewport({ width: 1200, height: 2000 });

    // 3. Giả lập User-Agent (như trước)
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

    // 5. Chờ 4 selector (like-count, comment-count, undefined-count, share-count)
    await Promise.all([
      page.waitForSelector('strong[data-e2e="like-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="comment-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="undefined-count"]', { timeout: 15000 }),
      page.waitForSelector('strong[data-e2e="share-count"]', { timeout: 15000 }),
    ]);

    // 6. Lấy innerText từng selector
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

    // 7. Chuyển thành số nguyên
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
        `Không thể parse đúng: likes="${likesText}", comments="${commentsText}", favorites="${favoritesText}", shares="${sharesText}"`
      );
    }

    // 8. Trả về JSON
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

// Phục vụ file index.html tại root
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});

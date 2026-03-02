const { chromium } = require('playwright');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function humanDelay(min=500, max=2000) {
  await sleep(Math.floor(Math.random() * (max - min) + min));
}

async function acceptCookies(page) {
  const cookieSelectors = [
    '#CookieBotDialogOkButton',
    'button[id*="accept"]',
    'button[class*="accept"]',
    'button[class*="cookie"]',
    '#onetrust-accept-btn-handler',
    '.cookie-accept',
    'button:has-text("Accept")',
    'button:has-text("Piekrītu")',
    'button:has-text("Akceptēt")',
  ];
  for (const sel of cookieSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click({ force: true });
        console.log(`  Cookies accepted: ${sel}`);
        await humanDelay(500, 1000);
        return;
      }
    } catch(e) {}
  }
}

async function searchMenessAptieka(browser, query) {
  console.log(`[Menesaptieka] Mekle: "${query}"`);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'lv-LV',
  });

  const page = await context.newPage();
  const results = [];

  try {
    await page.goto('https://e-menessaptieka.lv/lv', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(1000, 2000);
    await acceptCookies(page);

    const searchInput = await page.$('input[type="search"], input[placeholder*="mekl"], input[placeholder*="Mekl"], input[name="q"], #search');
    if (!searchInput) {
      console.log('[Menesaptieka] Nav meklesanas lauks');
      await page.screenshot({ path: 'debug-menesaptieka.png' });
      await context.close();
      return [];
    }

    await searchInput.click();
    await humanDelay(300, 700);
    await searchInput.type(query, { delay: 80 });
    await humanDelay(500, 1000);
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await humanDelay(1000, 2000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await humanDelay(500, 1000);

    const products = await page.evaluate(() => {
      const items = [];
      const els = document.querySelectorAll('a[href*="/p/"]');
      const seen = new Set();
      els.forEach((el, i) => {
        if (items.length >= 8) return;
        const href = el.href;
        if (seen.has(href)) return;
        seen.add(href);
        const title = el.querySelector('img')?.title || el.querySelector('img')?.alt;
        const parent = el.closest('div, article, li');
        const priceMatch = parent?.textContent?.match(/(\d+)[.,](\d+)\s*€/);
        const price = priceMatch ? parseFloat(`${priceMatch[1]}.${priceMatch[2]}`) : 0;
        if (title && title.length > 3 && price > 0) {
          items.push({ title: title.trim(), price, href });
        }
      });
      return items;
    });

    products.forEach(p => results.push({
      title: p.title, price: p.price, currency: 'EUR',
      url: p.href, source: 'Menesaptieka', country: 'LV',
      scrapedAt: new Date().toISOString(),
    }));

    console.log(`[Menesaptieka] ${results.length} rezultati`);
  } catch (err) {
    console.error(`[Menesaptieka] Kluda: ${err.message}`);
  }

  await context.close();
  return results;
}

async function searchBenu(browser, query) {
  console.log(`[BENU] Mekle: "${query}"`);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'lv-LV',
  });

  const page = await context.newPage();
  const results = [];

  try {
    await page.goto('https://www.benu.lv', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(1500, 3000);

    // Aizver cookie baneri ar force klik
    await acceptCookies(page);
    await humanDelay(500, 1000);

    // Ja vel ir cookiebot, gaida un meginam vel
    try {
      await page.waitForSelector('#CookieBotBluerredBackground', { state: 'hidden', timeout: 5000 });
    } catch(e) {}

    const searchInput = await page.$('input[type="search"], input[name="q"], input[id*="search"], input[class*="search"]');
    if (!searchInput) {
      console.log('[BENU] Nav meklesanas lauks');
      await page.screenshot({ path: 'debug-benu-home.png' });
      await context.close();
      return [];
    }

    await searchInput.click({ force: true });
    await humanDelay(400, 900);
    await searchInput.type(query, { delay: 90 });
    await humanDelay(600, 1200);
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await humanDelay(1500, 2500);
    await page.evaluate(() => window.scrollBy(0, 350));
    await humanDelay(500, 1000);

    const products = await page.evaluate(() => {
      const items = [];
      const selectors = ['.product-item', '[class*="ProductCard"]', '[class*="product-card"]', 'article[class*="product"]'];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          els.forEach((el, i) => {
            if (i >= 8) return;
            const title = el.querySelector('h2,h3,[class*="name"],[class*="title"]')?.textContent?.trim();
            const priceMatch = el.querySelector('[class*="price"],[class*="Price"]')?.textContent?.match(/(\d+)[.,](\d+)/);
            const price = priceMatch ? parseFloat(`${priceMatch[1]}.${priceMatch[2]}`) : 0;
            const href = el.querySelector('a')?.href;
            if (title && price > 0) items.push({ title, price, href });
          });
          if (items.length > 0) break;
        }
      }
      return items;
    });

    products.forEach(p => results.push({
      title: p.title, price: p.price, currency: 'EUR',
      url: p.href, source: 'BENU Aptieka', country: 'LV',
      scrapedAt: new Date().toISOString(),
    }));

    console.log(`[BENU] ${results.length} rezultati`);
    if (results.length === 0) {
      await page.screenshot({ path: 'debug-benu.png' });
      console.log('[BENU] Screenshot: debug-benu.png');
    }

  } catch (err) {
    console.error(`[BENU] Kluda: ${err.message}`);
  }

  await context.close();
  return results;
}

async function searchAll(query) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const [m, b] = await Promise.allSettled([
      searchMenessAptieka(browser, query),
      searchBenu(browser, query),
    ]);
    const all = [
      ...(m.status === 'fulfilled' ? m.value : []),
      ...(b.status === 'fulfilled' ? b.value : []),
    ];
    return all.sort((a, b) => a.price - b.price);
  } finally {
    await browser.close();
  }
}

module.exports = { searchAll };

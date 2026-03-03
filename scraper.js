const { chromium } = require('playwright');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function humanDelay(min=500, max=2000) {
  await sleep(Math.floor(Math.random() * (max - min) + min));
}

async function acceptCookies(page) {
  const btns = [
    '#CookieBotDialogOkButton',
    'button[id*="accept"]',
    'button[class*="accept"]',
    '#onetrust-accept-btn-handler',
    'button:has-text("Piekrītu")',
    'button:has-text("Akceptēt")',
    'button:has-text("Accept all")',
  ];
  for (const sel of btns) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click({ force: true });
        await humanDelay(500, 1000);
        return;
      }
    } catch(e) {}
  }
}

// ─── Mēness Aptieka ───────────────────────────────────────
async function searchMenessAptieka(browser, query) {
  console.log(`[Menesaptieka] Mekle: "${query}"`);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'lv-LV',
  });
  const page = await context.newPage();
  const results = [];

  try {
    await page.goto('https://e-menessaptieka.lv/lv', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(800, 1800);
    await acceptCookies(page);

    const input = await page.$('input[type="search"], input[placeholder*="mekl"], input[placeholder*="Mekl"], input[name="q"]');
    if (!input) { await context.close(); return []; }

    await input.click();
    await humanDelay(300, 700);
    await input.type(query, { delay: 80 });
    await humanDelay(500, 1000);
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await humanDelay(1000, 2000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await humanDelay(500, 1000);

    const products = await page.evaluate(() => {
      const items = [];
      const seen = new Set();
      document.querySelectorAll('a[href*="/p/"]').forEach((el) => {
        if (items.length >= 8) return;
        const href = el.href;
        if (seen.has(href)) return;
        seen.add(href);
        const title = el.querySelector('img')?.title || el.querySelector('img')?.alt;
        const parent = el.closest('div, article, li');
        const priceMatch = parent?.textContent?.match(/(\d+)[.,](\d+)\s*€/);
        const price = priceMatch ? parseFloat(`${priceMatch[1]}.${priceMatch[2]}`) : 0;
        if (title && title.length > 3 && price > 0) items.push({ title: title.trim(), price, href });
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

// ─── BENU Aptieka ─────────────────────────────────────────
async function searchBenu(browser, query) {
  console.log(`[BENU] Mekle: "${query}"`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'lv-LV',
    extraHTTPHeaders: {
      'Accept-Language': 'lv-LV,lv;q=0.9,en;q=0.8',
    },
  });

  await context.addCookies([
    { name: 'cookieconsent', value: 'accepted', domain: '.benu.lv', path: '/' },
  ]);

  const page = await context.newPage();
  
  // Paslepjam webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const results = [];

  try {
    const searchUrl = `https://www.benu.lv/meklet?search=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 3000);

    // Cookie
    try {
      const btn = page.locator('button:has-text("Piekr\u012btu"), button:has-text("Akcept\u0113t"), button:has-text("Labi")').first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click({ force: true });
        await humanDelay(1000, 1500);
      }
    } catch(e) {}

    // Gaida produktu dinamisku ieladi
    await humanDelay(3500, 4500);
    await page.evaluate(() => window.scrollBy(0, 800));
    await humanDelay(1000, 1500);

    const products = await page.evaluate(() => {
      const items = [];
      const seen = new Set();
      
      const allEls = document.querySelectorAll('[class*="product"], [class*="Product"], [class*="item"], article, li');
      
      allEls.forEach(el => {
        if (items.length >= 8) return;
        const text = el.innerText || '';
        const priceMatch = text.match(/([0-9]+)[.,]([0-9]{2})\s*[€]/);
        if (!priceMatch) return;
        const price = parseFloat(priceMatch[1] + '.' + priceMatch[2]);
        if (price < 0.5 || price > 150) return;
        
        const link = el.querySelector('a') && el.querySelector('a').href;
        if (!link || seen.has(link) || !link.includes('benu.lv')) return;
        seen.add(link);
        
        const titleEl = el.querySelector('h2, h3, h4, [class*="name"], [class*="title"]');
        const title = titleEl && titleEl.textContent.trim();
        
        if (title && title.length > 5) {
          items.push({ title: title.substring(0, 100).trim(), price: price, href: link });
        }
      });
      return items;
    });

    products.forEach(function(p) {
      results.push({
        title: p.title, price: p.price, currency: 'EUR',
        url: p.href, source: 'BENU Aptieka', country: 'LV',
        scrapedAt: new Date().toISOString(),
      });
    });

    console.log('[BENU] ' + results.length + ' rezultati');
    if (results.length === 0) {
      const text = await page.evaluate(() => document.body.innerText.substring(0, 600));
      console.log('[BENU] Lapa teksts:', text);
    }
  } catch (err) {
    console.error('[BENU] Kluda: ' + err.message);
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

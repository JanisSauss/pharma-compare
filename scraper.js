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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'lv-LV',
  });
  const page = await context.newPage();
  const results = [];

  try {
    // BENU izmanto /v/ URL struktura meklesanai
    const searchUrl = `https://www.benu.lv/v/${encodeURIComponent(query.toLowerCase())}`;
    console.log(`[BENU] URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(1000, 2000);
    await acceptCookies(page);
    await humanDelay(500, 1000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await humanDelay(800, 1500);

    const products = await page.evaluate(() => {
      const items = [];
      // BENU produktu kartinas
      const cards = document.querySelectorAll('a[href*="/e-aptieka/"]');
      const seen = new Set();
      
      cards.forEach((el) => {
        if (items.length >= 8) return;
        const href = el.href;
        if (seen.has(href) || !href.includes('/e-aptieka/')) return;
        seen.add(href);
        
        // Nosaukums no h2 vai teksda
        const title = el.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim() ||
                      el.querySelector('img')?.alt;
        
        // Cena - meklejam EUR vai € simbolu
        const parent = el.closest('div, article, li') || el.parentElement;
        const fullText = parent?.textContent || el.textContent;
        const priceMatch = fullText.match(/(\d+)[.,](\d+)\s*[€E]/);
        const price = priceMatch ? parseFloat(`${priceMatch[1]}.${priceMatch[2]}`) : 0;
        
        if (title && title.length > 3 && price > 0) {
          items.push({ title: title.trim(), price, href });
        }
      });
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
      console.log('[BENU] URL:', page.url());
      // Parrada pirmos 500 simbolus lai saprastu strukturu
      const text = await page.evaluate(() => document.body.innerText.substring(0, 500));
      console.log('[BENU] Lapa teksts:', text);
    }
  } catch (err) {
    console.error(`[BENU] Kluda: ${err.message}`);
  }
  await context.close();
  return results;
}

// ─── Mekle visas aptiekas paraleli ────────────────────────
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

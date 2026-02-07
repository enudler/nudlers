#!/usr/bin/env node
/**
 * Screenshot generator for Nudlers GitHub Pages site.
 * Navigates the running app, replaces ALL real data with fake data, and captures screenshots.
 *
 * Usage: cd app && node ../docs/take-screenshots.mjs
 * Requires: App running on localhost:6969
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, 'assets');
const APP_URL = 'http://localhost:6969';
const VIEWPORT = { width: 1440, height: 900 };

// ── Aggressive data replacement (runs in browser) ──────────

function replaceAllData() {
  // Fake data pools
  const fakeDescriptions = [
    'Shufersal Online', 'Rami Levy', 'AM:PM TLV', 'Café Café', 'Aroma Espresso',
    'Wolt Delivery', 'Japanika', 'Netflix', 'Spotify Premium', 'HOT Mobile',
    'Partner Comm.', 'Cellcom Bill', 'Paz Gas Station', 'Super-Pharm',
    'Castro Fashion', 'IKEA Israel', 'Rav Kav Charge', 'Gett Taxi', 'Apple Services',
    'Gym Plus', 'Maccabi Health', 'Arnona TLV', 'Electric Co.', 'Mekorot Water',
    'Zara Israel', 'Tiv Taam Market', 'Cofix Coffee', 'Roladin Bakery', 'Greg Café',
    'Amazon IL', 'Google Cloud', 'Home Center', 'Fox Home', 'Victory Supermarket',
    'Golf & Co', 'H&M Israel', 'Yochananof', 'Osher Ad', 'Bug Multistore',
    'iHerb Order', 'AliExpress', 'Booking.com', 'El Al Flight', 'Wix Premium',
    'Monday.com', 'Bezeq Internet', 'Yes TV', 'Pelephone', 'Strauss Coffee',
  ];

  const fakeCategories = [
    'Groceries', 'Dining Out', 'Transport', 'Entertainment', 'Health',
    'Shopping', 'Subscriptions', 'Utilities', 'Insurance', 'Education',
    'Travel', 'Home', 'Clothing', 'Gifts', 'Personal Care', 'Tech',
    'Food', 'Bills', 'Fuel', 'Fitness',
  ];

  const fakeBanks = ['Leumi', 'Hapoalim', 'Mizrahi', 'Discount'];
  const fakeCards = ['Visa Cal', 'Max', 'Isracard', 'Amex'];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randAmount = (min, max) => (Math.random() * (max - min) + min).toFixed(2);
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randLast4 = () => String(randInt(1000, 9999));

  // Track used descriptions to avoid repeats per replacement pass
  let descIdx = 0;
  const shuffled = [...fakeDescriptions].sort(() => Math.random() - 0.5);
  const nextDesc = () => shuffled[descIdx++ % shuffled.length];

  // Collect all text nodes
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  // Patterns
  const shekelRegex = /₪[\s]?[\d,]+\.?\d*/g;
  const hebrewRegex = /[\u0590-\u05FF]/;
  const cardNumberRegex = /[•·\.]{2,}\s*\d{3,4}/g;
  const last4Regex = /\d{4}\.\d{2}$/;

  for (const node of textNodes) {
    let text = node.textContent;
    if (!text || !text.trim()) continue;
    const trimmed = text.trim();

    // Skip very short or structural text
    if (trimmed.length < 2) continue;

    // 1. Replace shekel amounts everywhere
    if (shekelRegex.test(text)) {
      text = text.replace(shekelRegex, () => `₪${randAmount(25, 3500)}`);
      shekelRegex.lastIndex = 0;
    }

    // 2. Replace card numbers (•••• 1234 or .... 1234)
    if (cardNumberRegex.test(text)) {
      text = text.replace(cardNumberRegex, () => `•••• ${randLast4()}`);
      cardNumberRegex.lastIndex = 0;
    }

    // 3. Replace Hebrew text (likely descriptions or categories)
    if (hebrewRegex.test(trimmed)) {
      // Check if it's likely a category (short, in a chip/badge)
      const parent = node.parentElement;
      const isChip = parent && (
        parent.classList.contains('MuiChip-label') ||
        parent.closest('.MuiChip-root') ||
        parent.closest('[class*="chip"]') ||
        parent.closest('[class*="Chip"]') ||
        (parent.tagName === 'SPAN' && trimmed.length < 15)
      );

      if (isChip || trimmed.length < 12) {
        node.textContent = pick(fakeCategories);
      } else {
        node.textContent = nextDesc();
      }
      continue;
    }

    // 4. Replace standalone numbers that look like amounts (not dates, not IDs)
    const numericOnly = trimmed.replace(/,/g, '');
    if (/^\d+\.?\d{0,2}$/.test(numericOnly)) {
      const val = parseFloat(numericOnly);
      if (val > 10 && val < 100000) {
        node.textContent = text.replace(trimmed, randAmount(25, 4000));
        continue;
      }
    }

    // 5. Replace negative amounts like -₪123 or -123.45
    if (/^-[\d,]+\.?\d*$/.test(trimmed) || /^-₪/.test(trimmed)) {
      text = text.replace(/-[\d,]+\.?\d*/g, () => `-${randAmount(15, 2000)}`);
    }

    node.textContent = text;
  }

  // 6. Replace card number elements that show as "•••• XXXX" format
  document.querySelectorAll('span, p, div, td').forEach(el => {
    if (el.children.length > 0) return; // skip elements with children
    const t = el.textContent.trim();
    if (/^[•·\.]{2,}\s*\d{3,4}/.test(t)) {
      el.textContent = `•••• ${randLast4()}`;
    }
    // Also replace any remaining "Linked Bank" text
    if (t === 'Linked Bank' || t === 'Linked Card') {
      el.textContent = pick(fakeBanks);
    }
  });

  // 7. Replace bank/account names shown as headers
  document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="Typography"]').forEach(el => {
    const t = el.textContent;
    if (hebrewRegex.test(t)) {
      // If it's a header with Hebrew, replace with fake name
      el.textContent = nextDesc();
    }
  });
}

// ── Screenshot helpers ─────────────────────────────────────

async function waitForView(page, timeout = 5000) {
  await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
  try {
    await page.waitForFunction(
      () => !document.querySelector('.MuiCircularProgress-root'),
      { timeout }
    );
  } catch { /* no spinner, that's fine */ }
  await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
}

async function clickNavItem(page, label) {
  const clicked = await page.evaluate((targetLabel) => {
    const items = document.querySelectorAll('.MuiListItemText-root .MuiTypography-root');
    for (const item of items) {
      if (item.textContent.trim() === targetLabel) {
        const button = item.closest('.MuiListItemButton-root');
        if (button) { button.click(); return true; }
      }
    }
    return false;
  }, label);
  if (!clicked) console.warn(`  ⚠ Could not find nav item: "${label}"`);
  return clicked;
}

async function hideUiNoise(page) {
  await page.evaluate(() => {
    // Hide "Update Available" chip
    document.querySelectorAll('.MuiChip-root').forEach(chip => {
      if (chip.textContent.includes('Update Available')) {
        chip.closest('a')?.remove() || chip.remove();
      }
    });
  });
}

async function screenshot(page, name) {
  // Hide distracting UI elements
  await hideUiNoise(page);
  // Run data replacement twice to catch dynamically rendered content
  await page.evaluate(replaceAllData);
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await page.evaluate(replaceAllData);

  const filePath = path.join(ASSETS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, type: 'png' });

}

// ── Main ───────────────────────────────────────────────────

async function main() {


  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);


  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForView(page);

  // Ensure dark theme
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if (b.querySelector('svg[data-testid="LightModeIcon"]')) {
        // Already dark mode (LightMode icon means "switch to light")
        return;
      }
      if (b.querySelector('svg[data-testid="DarkModeIcon"]')) {
        b.click(); // Switch to dark
        return;
      }
    }
  });
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));

  // ── Desktop screenshots ──

  const views = [
    { nav: null, name: 'summary', wait: 3000 },
    { nav: 'Transactions', name: 'transactions', wait: 5000 },
    { nav: 'Breakdown', name: 'breakdown', wait: 5000 },
    { nav: 'Recurring', name: 'recurring', wait: 5000 },
    { nav: 'Projection', name: 'projection', wait: 5000 },
  ];

  for (const view of views) {

    if (view.nav) {
      await clickNavItem(page, view.nav);
    }
    await waitForView(page, view.wait);
    await screenshot(page, view.name);
  }

  // ── Mobile screenshot (fresh page to avoid drawer issues) ──

  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844 });
  await mobilePage.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await mobilePage.evaluate(() => new Promise(r => setTimeout(r, 4000)));

  // Ensure dark mode on mobile too
  await mobilePage.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if (b.querySelector('svg[data-testid="DarkModeIcon"]')) {
        b.click();
        return;
      }
    }
  });
  await mobilePage.evaluate(() => new Promise(r => setTimeout(r, 500)));

  await hideUiNoise(mobilePage);
  await mobilePage.evaluate(replaceAllData);
  await mobilePage.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await mobilePage.evaluate(replaceAllData);
  await mobilePage.screenshot({ path: path.join(ASSETS_DIR, 'mobile-summary.png'), type: 'png' });

  await mobilePage.close();


  await browser.close();
}

main().catch((err) => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});

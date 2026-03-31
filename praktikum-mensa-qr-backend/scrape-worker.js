// scrape-worker.js —— 由主线程启动，用于抓取/解析网页
const { parentPort, workerData } = require('worker_threads');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

(async () => {
  const target = workerData && workerData.target;
  const canteen = workerData && workerData.canteen;
  const t0 = Date.now();
  const todayDe = new Date().toLocaleDateString('de-DE'); // dd.mm.yyyy

  if (!target) {
    parentPort.postMessage({
      error: 'missing target',
      items: [],
      canteen,
      date: new Date().toISOString().slice(0, 10),
      fetched_at: new Date().toISOString(),
      timeDiff: Date.now() - t0,
    });
    return;
  }

  const resp = await fetch(target);
  if (!resp.ok) {
    parentPort.postMessage({
      error: `http ${resp.status} ${resp.statusText}`,
      items: [],
      canteen,
      date: new Date().toISOString().slice(0, 10),
      fetched_at: new Date().toISOString(),
      timeDiff: Date.now() - t0,
    });
    return;
  }

  const html = await resp.text();

  // 使用 cheerio 解析 HTML —— 根据目标站实际结构调整选择器
  const $ = cheerio.load(html);
  const items = [];

  // 针对 Studierendenwerk 页面做的解析
  if (target.includes('studierendenwerk-muenchen-oberbayern.de')) {
    // 先找到今天对应的日区块（含有今日日期的 strong 或文本）
    let daySection = null;
    $('.c-schedule__item').each((_, el) => {
      const text = $(el).text();
      if (text && text.includes(todayDe)) {
        daySection = $(el);
        return false; // break
      }
    });

    const scope = daySection || $('body');
    scope.find('.c-menu-dish__title').each((_, el) => {
      const name = $(el).text().trim();
      if (name) items.push({ name, type: '', prices: [], labels: [] });
    });

    // 去重
    const seen = new Set();
    const cleaned = [];
    for (const it of items) {
      const name = (it.name || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      cleaned.push({ name, type: '', prices: [], labels: [] });
    }
    items.length = 0;
    items.push(...cleaned);
  }

  // 其他页面的通用解析（如有需要可保留）
  if (!items.length) {
    $('.dish-card, .menu-item').each((_, el) => {
      const name = $(el).find('.dish-name, .title, h3').first().text().trim();
      const type = $(el).find('.dish-type, .category').first().text().trim();

      const prices = [];
      const stud = $(el).find('.price-student, .studierende').first().text().trim();
      const emp  = $(el).find('.price-employee, .mitarbeiter').first().text().trim();
      const guest= $(el).find('.price-guest, .gaeste, .gäste').first().text().trim();
      if (stud) prices.push({ label: 'Studierende', text: stud });
      if (emp)  prices.push({ label: 'Mitarbeiter', text: emp });
      if (guest)prices.push({ label: 'Gäste', text: guest });

      const labels = $(el).find('.labels span, .icons .icon').map((i,x)=>$(x).text().trim()).get().filter(Boolean);

      if (name) {
        items.push({
          name,
          type,
          prices,
          labels,
        });
      }
    });
  }

  // 如果解析不到，给一个占位
  if (!items.length) {
    items.push({
      name: `Scraped from ${target}`,
      type: 'scrape',
      prices: [],
      labels: [],
    });
  }

  parentPort.postMessage({
    items,
    canteen,
    date: new Date().toISOString().slice(0, 10),
    fetched_at: new Date().toISOString(),
    timeDiff: Date.now() - t0,
  });
})().catch(err => {
  parentPort.postMessage({ error: err.message, items: [] });
});

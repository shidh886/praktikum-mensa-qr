
const { parentPort, workerData } = require('worker_threads');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

(async () => {
  const target = workerData && workerData.target;
  const canteen = workerData && workerData.canteen;
  const t0 = Date.now();
  const todayDe = new Date().toLocaleDateString('de-DE'); 

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

  
  const $ = cheerio.load(html);
  const items = [];

  
  if (target.includes('studierendenwerk-muenchen-oberbayern.de')) {
    
    let daySection = null;
    $('.c-schedule__item').each((_, el) => {
      const text = $(el).text();
      if (text && text.includes(todayDe)) {
        daySection = $(el);
        return false; 
      }
    });

    const scope = daySection || $('body');
    scope.find('.c-menu-dish__title').each((_, el) => {
      const name = $(el).text().trim();
      if (name) items.push({ name, type: '', prices: [], labels: [] });
    });

    
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

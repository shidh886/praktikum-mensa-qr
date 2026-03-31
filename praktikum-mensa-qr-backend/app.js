// app.js  —— Mensa 后端 Demo（CPEE + eat-api）
// - /update  : 给 CPEE 用的状态机（现在 event 来自 JSON 的 action）
// - /api/menu: 封装 eat-api，返回指定食堂当天菜单（简单版）

const express = require('express');
const morgan = require('morgan');
const { Worker } = require('worker_threads');
const app = express();
const PORT = 9002;

// node-fetch v2 作为 fetch polyfill（兼容旧 Node）
const fetch = require('node-fetch');

// 让 Express 能读 CPEE 发来的 x-www-form-urlencoded 和 JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('tiny'));

// 抓取缓存：针对抓取型食堂，按 target+date 临时缓存一次抓取结果
const scrapeCache = new Map();

// 启动 worker 线程抓取网页菜单；主线程不阻塞
function runScrapeWorker(target, canteen) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__dirname + '/scrape-worker.js', {
      workerData: { target, canteen }
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`scrape worker exit code ${code}`));
    });
  });
}

// -------------------- 小工具 --------------------

// 兼容 body/form/query 读取 CPEE 传来的状态参数，统一转字符串
function readUpdateParams(req) {
  const src = (req.body && Object.keys(req.body).length ? req.body : req.query) || {};
  const state   = (src.state   || 'intro').toString();
  const event   = (src.event   || '').toString();
  const canteen = (src.canteen || '').toString();
  return { state, event, canteen };
}

// 把 YYYY-MM-DD 转成 eat-api 需要的 ISO 年 + 周
function dateToYearWeek(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // 防止时区边界问题

  // ISO week：周一=0 ... 周日=6
  const dayNr = (date.getDay() + 6) % 7;
  const tmp   = new Date(date);
  tmp.setDate(tmp.getDate() - dayNr + 3); // 调到该周周四

  const firstThursday = new Date(tmp.getFullYear(), 0, 4);
  const diff = tmp - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));

  return { year: tmp.getFullYear(), week };
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

// 把我们内部的 canteen id 映射到 eat-api 的 key
function mapCanteenToEatApiKey(canteen) {
  const map = {
    garching: 'mensa-garching',
    arcis:    'mensa-arcisstr',
    loth:     'mensa-lothstr',
    leopold:  'mensa-leopoldstr', // 没有单独奥林匹亚，就先复用 garching 做 demo
  };
  return map[canteen] || canteen; // 如果本身就是 mensa-garching 之类，就直接用
}

// 配置数据源：默认 api，可选 scrape
function getCanteenSource(canteen) {
  const sources = {
    garching: { type: 'api' },
    arcis:    { type: 'api' },
    loth:     { type: 'api' },
    leopold:  { type: 'api' },
    // StuBistro Boltzmann（抓取）
    Boltzmann: {
      type: 'scrape',
      target: 'https://www.studierendenwerk-muenchen-oberbayern.de/mensa/speiseplan/speiseplan_457_-de.html',
    },
    // 示例：开启抓取
    // custom:  { type: 'scrape', target: 'https://example.com/menu' },
  };
  return sources[canteen] || { type: 'api' };
}

// 地址映射备用
function getCanteenAddress(canteen) {
  const map = {
    garching: 'Boltzmannstr. 19, 85748 Garching',
    arcis:    'Arcisstraße 17, 80333 München',
    loth:     'Lothstraße 34, 80335 München',
    leopold:  'Leopoldstraße 13a, München',
    Boltzmann:'Boltzmannstr. 15, 85748 Garching',
  };
  return map[canteen] || '';
}

// 价格格式化：支持 base_price + price_per_unit 格式（如 1.00 € + 0.80 € / 100g）
function formatPriceEntry(entry) {
  if (entry === undefined || entry === null) return '';

  // 纯数字
  if (typeof entry === 'number') {
    return entry.toFixed(2) + ' €';
  }

  // 可能已经是字符串
  if (typeof entry === 'string') {
    return entry;
  }

  const base = entry.base_price;
  const per  = entry.price_per_unit || entry.price || null;
  const unit = entry.unit || entry.price_unit || '';

  const parts = [];
  if (typeof base === 'number') {
    parts.push(base.toFixed(2) + ' €');
  }
  if (typeof per === 'number') {
    parts.push(per.toFixed(2) + ' €' + (unit ? ' / ' + unit : ''));
  }

  if (parts.length === 0 && entry.students) {
    // 有时会套在 students/employees 里；留给调用方处理
    return '';
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join(' + ');
}

function buildPriceLines(prices) {
  if (!prices || typeof prices !== 'object') return [];

  const map = [
    ['students',  'Studierende'],
    ['staff',     'Mitarbeiter'],
    ['employees', 'Mitarbeiter'],
    ['employee',  'Mitarbeiter'],
    ['pupils',    'Schüler'],
    ['others',    'Gäste'],
    ['guests',    'Gäste'],
    ['guest',     'Gäste'],
  ];

  const lines = [];

  for (const [key, label] of map) {
    const entry = prices[key];
    const text = formatPriceEntry(entry);
    if (text) {
      lines.push({ label, text });
    }
  }

  return lines;
}

// -------------------- 健康检查 --------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// -------------------- 菜单 API：/api/menu --------------------
// GET /api/menu?canteen=garching&date=2025-11-29
// date 可选，默认今天
app.get('/api/menu', async (req, res) => {
  try {
    let canteen = (req.query.canteen || '').toString();
    let date    = (req.query.date    || '').toString();

    if (!canteen) {
      return res.status(400).json({ error: 'missing canteen query param' });
    }
    if (!date) {
      date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }

    const source = getCanteenSource(canteen);

    if (source.type === 'scrape') {
      const target = source.target || '';
      if (!target) {
        return res.status(500).json({ error: 'scrape target not configured for this canteen' });
      }
      const cacheKey = `${target}::${date}`;
      if (scrapeCache.has(cacheKey)) {
        return res.json({
          canteen,
          date,
          items: scrapeCache.get(cacheKey).items || [],
          address: getCanteenAddress(canteen),
          source: 'scrape-cache',
        });
      }

      try {
        console.log('[/api/menu] scrape worker start:', target);
        const result = await runScrapeWorker(target, canteen);
        const items = Array.isArray(result.items) ? result.items : [];
        scrapeCache.set(cacheKey, { items, fetched_at: result.fetched_at || new Date().toISOString() });
        return res.json({
          canteen,
          date: result.date || date,
          items,
          address: getCanteenAddress(canteen),
          source: 'scrape',
        });
      } catch (err) {
        console.error('[/api/menu] scrape worker error:', err);
        return res.status(502).json({ error: 'scrape failed: ' + err.message });
      }
    } else {
      const eatApiKey = mapCanteenToEatApiKey(canteen);
      const { year, week } = dateToYearWeek(date);

      const url = `https://tum-dev.github.io/eat-api/${eatApiKey}/${year}/${pad2(week)}.json`;
      console.log('[/api/menu] fetch:', url);

      const resp = await fetch(url);
      if (!resp.ok) {
        return res.status(resp.status).json({
          error: `eat-api http ${resp.status}: ${resp.statusText}`,
        });
      }

      const weekData = await resp.json();
      const days = weekData.days || [];
      const today = days.find(d => d.date === date);
      const address = weekData.address
        || (weekData.meta && weekData.meta.address)
        || (weekData.canteen && weekData.canteen.address)
        || getCanteenAddress(canteen);

      if (!today) {
        return res.status(404).json({
          error: `no menu for ${eatApiKey} on ${date}`,
        });
      }

      const dishes = today.dishes || [];

      const items = dishes.map(d => ({
        name:   d.name || '',
        type:   d.category || d.dish_type || '',
        prices: buildPriceLines(d.prices || {}),
        labels: d.labels || [],
      }));

      res.json({
        canteen,
        eat_api_key: eatApiKey,
        date,
        address,
        items,
        source: 'api',
      });
    }
  } catch (err) {
    console.error('[/api/menu] error:', err);
    res.status(500).json({ error: 'internal error: ' + err.message });
  }
});

// -------------------- CPEE 状态机：/update --------------------
// 输入：state/event/canteen，输出：新的 state/canteen（用于 CPEE 跳转）
function handleUpdate(req, res) {
  const { state, event, canteen } = readUpdateParams(req);

  console.log('[/update] incoming:', {
    method: req.method,
    state,
    event,
    canteen,
  });

  let newState   = state || 'intro';
  let newCanteen = canteen || '';

  // ★ 全局退出：扫“退出”二维码
  if (event === 'exit') {
    newState   = 'abort';
    newCanteen = '';

  } else if (state === 'intro') {
    // 首页：去列表
    if (event === 'show-list') {
      newState   = 'list';
      newCanteen = '';
    } else {
      newState = 'intro';
    }

  } else if (state === 'list') {
    // 列表页：返回首页 / 选食堂
    if (event === 'back-main') {
      newState   = 'intro';
      newCanteen = '';
    } else if (event === 'show-menu' && canteen) {
      newState   = 'menu';
      newCanteen = canteen;
    } else {
      newState   = 'intro';
      newCanteen = '';
    }

  } else if (state === 'menu') {
    // 菜单页：返回列表 / 返回首页
    if (event === 'back-list') {
      newState = 'list';
      // 保留 canteen
    } else if (event === 'back-main') {
      newState   = 'intro';
      newCanteen = '';
    } else {
      newState   = 'intro';
      newCanteen = '';
    }

  } else {
    newState   = 'intro';
    newCanteen = '';
  }

  const result = { state: newState, canteen: newCanteen };
  console.log('[/update] result:', result);
  res.json(result);
}

app.post('/update', handleUpdate);
app.put('/update',  handleUpdate);
app.get('/update',  handleUpdate);

// -------------------- 启动 --------------------
app.listen(PORT, () => {
  console.log(`Mensa backend listening at http://0.0.0.0:${PORT}`);
  console.log(`Health:  https://lehre.bpm.in.tum.de/ports/${PORT}/health`);
  console.log(`Update:  POST/PUT https://lehre.bpm.in.tum.de/ports/${PORT}/update`);
  console.log(`Menu:    GET      https://lehre.bpm.in.tum.de/ports/${PORT}/api/menu?canteen=garching`);
});

// In-house invoice reader — no AI. PDF text layer via pdf.js, images via Tesseract OCR,
// then a rules-based line-item parser tuned for parts/repair-shop invoices.
const InvoiceParser = (() => {
  const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lazy="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded) return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', reject);
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.dataset.lazy = src;
      el.onload = () => { el.dataset.loaded = '1'; resolve(); };
      el.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  function dataUrlToUint8(dataUrl) {
    const b64 = dataUrl.split(',')[1] || '';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function pdfText(dataUrl) {
    const pdfjs = await import(/* webpackIgnore: true */ PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const doc = await pdfjs.getDocument({ data: dataUrlToUint8(dataUrl) }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map();
      content.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const y = Math.round(it.transform[5] / 3) * 3;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: it.transform[4], s: it.str });
      });
      const lines = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, runs]) => runs.sort((a, b) => a.x - b.x).map((r) => r.s).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      pages.push(lines.join('\n'));
    }
    return pages.join('\n');
  }

  async function imageText(dataUrl, onProgress) {
    await loadScript(TESSERACT_URL);
    const worker = await window.Tesseract.createWorker('eng', 1, {
      logger: (m) => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); },
    });
    try {
      const { data } = await worker.recognize(dataUrl);
      return data.text || '';
    } finally {
      await worker.terminate();
    }
  }

  async function readInvoiceText(dataUrl, mimeType, onProgress) {
    if (mimeType === 'application/pdf') {
      const text = await pdfText(dataUrl);
      if (text.replace(/\s/g, '').length > 40) return text;
      throw new Error('SCANNED_PDF');
    }
    return imageText(dataUrl, onProgress);
  }

  const MONEY = /(?:\$\s*)?-?\d{1,3}(?:,\d{3})+(?:\.\d{2})|(?:\$\s*)?-?\d+\.\d{2}|\$\s*-?\d+/g;
  const SKIP_LINE = /\b(sub\s*-?total|total|tax|gst|pst|hst|vat|balance|amount\s+due|due\s+date|payment|paid|deposit|discount|freight|shipping|handling|invoice\s*(no|#|number)|account|terms|page\s+\d|remit|thank\s*you|signature|customer\s+copy|po\s*(no|#)|work\s*order)\b/i;
  const VENDOR_HINT = /\b(inc|inc\.|ltd|ltd\.|llc|l\.l\.c|co\.|corp|corporation|company|supply|supplies|parts|equipment|tractor|implement|auto|hardware|industrial|services|service|repair|farm|petroleum|oil|tire|welding|distributors?|wholesale)\b/i;
  const NOISE_LINE = /^(qty|quantity|description|item|part|unit|price|amount|line|no\.?|#)\b/i;

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  function pad(n) { return String(n).padStart(2, '0'); }

  function normalizeYear(y) {
    const n = parseInt(y, 10);
    if (n > 1900) return n;
    return n <= 50 ? 2000 + n : 1900 + n;
  }

  function validDate(y, m, d) {
    if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
    if (y < 1990 || y > new Date().getFullYear() + 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  function findInvoiceDate(text) {
    const candidates = [];
    let re = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, m;
    while ((m = re.exec(text))) {
      const v = validDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (v) candidates.push(v);
    }
    re = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})\b/g;
    while ((m = re.exec(text))) {
      const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (mo) { const v = validDate(normalizeYear(m[3]), mo, parseInt(m[1], 10)); if (v) candidates.push(v); }
    }
    re = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/g;
    while ((m = re.exec(text))) {
      const mo = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (mo) { const v = validDate(normalizeYear(m[3]), mo, parseInt(m[2], 10)); if (v) candidates.push(v); }
    }
    re = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
    while ((m = re.exec(text))) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10), y = normalizeYear(m[3]);
      const v = validDate(y, a, b) || validDate(y, b, a);
      if (v) candidates.push(v);
    }
    if (!candidates.length) return '';
    const today = new Date().toISOString().slice(0, 10);
    return candidates.find((c) => c <= today) || candidates[0];
  }

  function findVendor(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 14);
    const clean = (l) => l.replace(/\s{2,}/g, ' ').trim();
    const isBad = (l) => l.length < 3 || l.length > 60 || SKIP_LINE.test(l) || NOISE_LINE.test(l)
      || /^[\d\W]+$/.test(l) || /@|\bwww\.|\.com\b/i.test(l) || /\b(invoice|receipt|statement|bill\s+to|ship\s+to|sold\s+to)\b/i.test(l);
    const hinted = lines.find((l) => !isBad(l) && VENDOR_HINT.test(l));
    if (hinted) return clean(hinted);
    const first = lines.find((l) => !isBad(l) && /[A-Za-z]{3}/.test(l));
    return first ? clean(first) : '';
  }

  function toNum(token) {
    return parseFloat(String(token).replace(/[$,\s]/g, '')) || 0;
  }

  const UNIT_WORDS = 'x|@|ea\\.?|each|pcs?|pieces?|units?|hrs?|hours?|gal|gals?|l|lt|ltr|litres?|liters?|kg|kgs?|lbs?|lb|qty';

  function cleanPart(line, moneyTokens) {
    let s = line;
    moneyTokens.forEach((t) => { s = s.replace(t, ' '); });
    s = s.replace(new RegExp('\\b\\d+(?:\\.\\d+)?\\s*(?:' + UNIT_WORDS + ')\\b', 'gi'), ' ');
    s = s.replace(/^\s*\d+(?:\.\d+)?\s+/, ' ');
    s = s.replace(/\s{2,}/g, ' ').replace(/[|•·]+/g, ' ');
    s = s.replace(/^[\s\-–—:.,]+|[\s\-–—:.,]+$/g, '');
    return s.trim();
  }

  function findQty(line) {
    let m = line.match(new RegExp('\\b(\\d{1,4}(?:\\.\\d{1,3})?)\\s*(?:' + UNIT_WORDS + ')\\b', 'i'));
    if (m) return m[1];
    m = line.match(/^\s*(?:\d{1,3}\s+)?(\d{1,4}(?:\.\d{1,2})?)\s+[A-Za-z]/);
    if (m && parseFloat(m[1]) <= 999) return m[1];
    m = line.match(/\bqty\W*(\d{1,4}(?:\.\d{1,2})?)/i);
    if (m) return m[1];
    return '1';
  }

  function parseInvoiceLines(text) {
    const vendor = findVendor(text);
    const date = findInvoiceDate(text) || new Date().toISOString().slice(0, 10);
    const rawLines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const items = [];

    rawLines.forEach((line) => {
      if (SKIP_LINE.test(line) || NOISE_LINE.test(line)) return;
      const money = line.match(MONEY);
      if (!money || !money.length) return;
      const letters = (line.match(/[A-Za-z]/g) || []).length;
      if (letters < 3) return;

      const nums = money.map(toNum).filter((n) => n !== 0);
      if (!nums.length) return;

      const part = cleanPart(line, money);
      if (!part || part.length < 2 || (part.match(/[A-Za-z]/g) || []).length < 2) return;

      const qtyStr = findQty(line);
      const qty = parseFloat(qtyStr) || 1;
      let unit, total;

      if (nums.length === 1) {
        total = nums[0];
        unit = qty > 0 ? total / qty : total;
      } else {
        total = nums[nums.length - 1];
        unit = nums[nums.length - 2];
        const expected = unit * qty;
        if (Math.abs(expected - total) > Math.max(0.05, total * 0.02)) {
          if (Math.abs(nums[0] * qty - total) <= Math.max(0.05, total * 0.02)) unit = nums[0];
          else if (qty > 0) unit = total / qty;
        }
      }
      if (total <= 0) return;

      items.push({
        part,
        qty: qtyStr,
        unitCost: unit ? unit.toFixed(2) : '',
        totalCost: total.toFixed(2),
        vendor,
        date,
      });
    });

    return { vendor, date, items };
  }

  return { readInvoiceText, parseInvoiceLines, findInvoiceDate, findVendor };
})();

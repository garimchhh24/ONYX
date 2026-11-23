// Renders a TradingView-style chart with a Long Position tool to e2e/fixtures/nq-long.png (test input only).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const candles = [];
  let price = 21462;
  for (let i = 0; i < 60; i++) {
    const o = price, c = price + (Math.sin(i / 4) * 6 + (i > 30 ? 2.2 : -1.4));
    const h = Math.max(o, c) + 3, l = Math.min(o, c) - 3;
    candles.push({ o, c, h, l });
    price = c;
  }
  const y = (v) => 640 - (v - 21400) * 5.2;
  const bars = candles.map((k, i) => {
    const x = 60 + i * 16, up = k.c >= k.o, col = up ? '#26a69a' : '#ef5350';
    return `<line x1="${x}" x2="${x}" y1="${y(k.h)}" y2="${y(k.l)}" stroke="${col}"/><rect x="${x - 5}" width="10" y="${y(Math.max(k.o, k.c))}" height="${Math.max(1, Math.abs(y(k.o) - y(k.c)))}" fill="${col}"/>`;
  }).join('');
  const scale = Array.from({ length: 12 }, (_, i) => 21400 + i * 10).filter((v) => ![21490, 21450.25, 21430].some((q) => Math.abs(q - v) < 6)).map((v) => `<text x="1205" y="${y(v) + 4}" fill="#b2b5be" font-size="12">${v.toFixed(2)}</text>`).join('');
  await p.setContent(`<body style="margin:0;background:#131722;font-family:Arial">
  <svg width="1280" height="720">
    <text x="16" y="26" fill="#d1d4dc" font-size="15">NQZ2026 · 5 · CME  </text><text x="190" y="26" fill="#787b86" font-size="13">E-mini Nasdaq-100 Futures</text>
    ${bars}
    <rect x="620" y="${y(21490)}" width="420" height="${y(21450.25) - y(21490)}" fill="rgba(38,166,154,0.25)"/>
    <rect x="620" y="${y(21450.25)}" width="420" height="${y(21430) - y(21450.25)}" fill="rgba(239,83,80,0.25)"/>
    <text x="640" y="${y(21490) + 18}" fill="#fff" font-size="12">Target: 39.75 (0.19%) 159, Amount: 1590</text>
    <text x="640" y="${y(21450.25) - 6}" fill="#fff" font-size="12">Closed P&amp;L: 1290, Qty: 2, Risk/Reward Ratio: 1.96</text>
    <text x="640" y="${y(21430) - 6}" fill="#fff" font-size="12">Stop: 20.25 (0.09%) 81, Amount: 810</text>
    <rect x="1195" y="${y(21490) - 9}" width="80" height="18" fill="#26a69a"/><text x="1200" y="${y(21490) + 4}" fill="#fff" font-size="12">21490.00</text>
    <rect x="1195" y="${y(21450.25) - 9}" width="80" height="18" fill="#2962ff"/><text x="1200" y="${y(21450.25) + 4}" fill="#fff" font-size="12">21450.25</text>
    <rect x="1195" y="${y(21430) - 9}" width="80" height="18" fill="#ef5350"/><text x="1200" y="${y(21430) + 4}" fill="#fff" font-size="12">21430.00</text>
    ${scale}
    <text x="1080" y="705" fill="#787b86" font-size="12">09:42  →  10:05   (UTC-5) New York</text>
  </svg></body>`);
  await p.screenshot({ path: 'e2e/fixtures/nq-long.png' });
  await b.close();
  console.log('fixture written');
})();

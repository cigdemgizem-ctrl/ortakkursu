// ortakkursu.com — site derleyici
// Çalıştırma: node build.mjs   → çıktı dist/ klasörüne yazılır.
// Substack'ten son bülten sayıları, podcast bölümleri ve yazılar çekilir;
// bağlantı kurulamazsa data/substack-onbellek.json kullanılır.

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const site = JSON.parse(await readFile('data/site.json', 'utf8'));
const manuel = JSON.parse(await readFile('data/yazilar.json', 'utf8')).yazilar;
const konusmalar = JSON.parse(await readFile('data/konusmalar.json', 'utf8')).konusmalar;
const onbellek = JSON.parse(await readFile('data/substack-onbellek.json', 'utf8'));

const KATEGORILER = [
  { id: 'dijital', ad: 'Dijital piyasalar ve platformlar' },
  { id: 'yz', ad: 'Yapay zekâ' },
  { id: 'rekabet', ad: 'Rekabet hukuku uygulaması' },
  { id: 'egemenlik', ad: 'Ticaret, sanayi ve egemenlik' },
  { id: 'toplum', ad: 'Toplum ve kamu politikası' },
];
const katAd = Object.fromEntries(KATEGORILER.map((k) => [k.id, k.ad]));
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// ---------- Substack ----------
async function substackCek() {
  const hepsi = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const url = `${site.substackAdres}/api/v1/archive?sort=new&offset=${offset}&limit=50`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ortakkursu.com site derleyici' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Substack yanıtı ${r.status}`);
    const sayfa = await r.json();
    if (!Array.isArray(sayfa)) throw new Error('Beklenmeyen Substack yanıtı');
    hepsi.push(...sayfa);
    if (sayfa.length < 50) break;
  }
  return hepsi
    .map((p) => ({
      title: p.title, subtitle: p.subtitle || '', post_date: p.post_date,
      canonical_url: p.canonical_url, slug: p.slug,
      type: p.type === 'podcast' || p.podcast_url ? 'podcast' : 'newsletter',
      podcast_duration: p.podcast_duration || null,
      cover_image: p.cover_image || '',
      ozet_yedek: (p.truncated_body_text || p.description || '').trim(),
    }));
}

// Bülten sayısının "Bu sayıda" bölümünü özet olarak çıkar
function htmlMetin(h) {
  return h.replace(/<\/(p|li|h[1-6]|div|blockquote)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#8217;/g, '’').replace(/&#8220;|&#8221;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function kisalt(t, n = 300) {
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const k = t.slice(0, n); const son = Math.max(k.lastIndexOf('. '), k.lastIndexOf('; '));
  return (son > n * 0.5 ? k.slice(0, son + 1) : k.replace(/\s+\S*$/, '') + '…');
}
async function sayiOzeti(slug) {
  const r = await fetch(`${site.substackAdres}/api/v1/posts/${slug}`, { headers: { 'User-Agent': 'ortakkursu.com site derleyici' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const j = await r.json();
  const bloklar = (j.body_html || '').match(/<(p|li|h[1-6]|blockquote)[^>]*>[\s\S]*?<\/\1>/gi) || [];
  const metinler = bloklar.map((b) => htmlMetin(b).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const i = metinler.findIndex((t) => /^Bu say[ıi]da/i.test(t));
  if (i < 0) return [];
  const maddeler = [];
  const ilk = metinler[i].replace(/^Bu say[ıi]da\s*[:…\.]*\s*/i, '');
  if (ilk) maddeler.push(ilk);
  for (let k = i + 1; k < metinler.length && maddeler.length < 6; k++) {
    if (/^(Başlarken|Takip listesi|Kıssadan)/i.test(metinler[k])) break;
    if (metinler[k].length > 3) maddeler.push(metinler[k]);
    if (maddeler.join(' ').length > 700) break;
  }
  return maddeler;
}

const SAYI_RE = /Teknoloji\s*·\s*Hukuk\s*·\s*Politika\s*\((\d{4})\/(\d{1,2})\)/i;
let gonderiler = onbellek;
try {
  const taze = await substackCek();
  if (taze.length) {
    const bySlug = new Map(onbellek.map((p) => [p.slug, p]));
    for (const p of taze) { const eski = bySlug.get(p.slug) || {}; bySlug.set(p.slug, { ...eski, ...p, ozet: eski.ozet && eski.ozet.length ? eski.ozet : [], cover_image: p.cover_image || eski.cover_image || '' }); }
    for (const p of bySlug.values()) {
      if (SAYI_RE.test(p.title) && !(p.ozet && p.ozet.length)) { try { p.ozet = await sayiOzeti(p.slug); } catch { /* özet alınamazsa boş kalır */ } }
    }
    gonderiler = [...bySlug.values()];
    await writeFile('data/substack-onbellek.json', JSON.stringify(gonderiler, null, 2) + '\n');
    console.log(`Substack: ${taze.length} gönderi çekildi.`);
  }
} catch (e) {
  console.warn(`Substack'e ulaşılamadı (${e.message}); önbellek kullanılıyor.`);
}
gonderiler.sort((a, b) => (a.post_date < b.post_date ? 1 : -1));

const sayilar = [], bolumler = [], substackYazilar = [];
for (const p of gonderiler) {
  const m = p.title.match(SAYI_RE);
  if (m) sayilar.push({ ...p, no: `${m[1]}/${m[2]}`, yil: Number(m[1]), hafta: Number(m[2]) });
  else if (p.type === 'podcast') bolumler.push(p);
  else substackYazilar.push(p);
}
// Bölüm numaraları: başlıkta "Bölüm N:" varsa o, yoksa sıraya göre
const kronolojik = [...bolumler].reverse();
kronolojik.forEach((b, i) => {
  const m = b.title.match(/^Bölüm\s+(\d+)\s*[:\-–]\s*(.*)$/i);
  b.no = m ? Number(m[1]) : i + 1;
  b.ad = m ? m[2] : b.title;
});

function tahminKategori(p) {
  const k = site.substackYaziKategorileri?.[p.slug];
  if (k) return k;
  const t = `${p.title} ${p.subtitle}`.toLocaleLowerCase('tr');
  if (/yapay zek|\bai\b|gpt|dil model|llm|claude|gemini/.test(t)) return 'yz';
  if (/çip|egemenlik|jeopolit|ticaret|sanayi|ihracat|gümrük/.test(t)) return 'egemenlik';
  if (/rekabet|antitrust|tekel|monopol|ftc|birleşme/.test(t)) return 'rekabet';
  if (/çocuk|demograf|eğitim|göç|toplum/.test(t)) return 'toplum';
  return 'dijital';
}

// ---------- Yardımcılar ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tarihMetni = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const gunAy = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]}`; };
function anahtarTarih(t) { // "YYYY-AA-GG" (00 = bilinmiyor) → gösterim
  const [, a, g] = t.split('-').map(Number);
  if (!a) return '';
  return g ? `${g} ${AYLAR[a - 1]}` : AYLAR[a - 1];
}

function haftaAraligi(yil, hafta) { // ISO hafta → "12–18 Ekim 2026"
  const ocak4 = new Date(Date.UTC(yil, 0, 4));
  const pzt = new Date(ocak4); pzt.setUTCDate(ocak4.getUTCDate() - ((ocak4.getUTCDay() + 6) % 7) + (hafta - 1) * 7);
  const paz = new Date(pzt); paz.setUTCDate(pzt.getUTCDate() + 6);
  const a1 = AYLAR[pzt.getUTCMonth()], a2 = AYLAR[paz.getUTCMonth()];
  if (pzt.getUTCFullYear() !== paz.getUTCFullYear()) return `${pzt.getUTCDate()} ${a1} ${pzt.getUTCFullYear()} – ${paz.getUTCDate()} ${a2} ${paz.getUTCFullYear()}`;
  return a1 === a2 ? `${pzt.getUTCDate()}–${paz.getUTCDate()} ${a2} ${paz.getUTCFullYear()}` : `${pzt.getUTCDate()} ${a1} – ${paz.getUTCDate()} ${a2} ${paz.getUTCFullYear()}`;
}
function sayiKarti(s, buyuk) {
  const maddeler = Array.isArray(s.ozet) ? s.ozet : [];
  const gosterilen = buyuk ? maddeler : maddeler.slice(0, 2);
  const ozetHTML = gosterilen.length
    ? `<ul class="sayi-ozet">${gosterilen.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
    : (s.ozet_yedek ? `<p class="sayi-ozet">${esc(kisalt(s.ozet_yedek, 260))}</p>` : '');
  const kapak = s.cover_image || '';
  return `<a class="kart sayi${buyuk ? ' sayi-buyuk' : ''}" href="${esc(s.canonical_url)}">${kapak ? `<span class="sayi-kapak"><img src="${esc(kapak)}" alt="" loading="${buyuk ? 'eager' : 'lazy'}"></span>` : ''}<span class="sayi-govde"><span class="etiket">${buyuk ? 'Son sayı · ' : ''}Sayı ${s.no}</span><span class="sayi-hafta">${haftaAraligi(s.yil, s.hafta)}</span>${ozetHTML}<span class="oku">Oku →</span></span></a>`;
}

// ---------- Yazılar listesi ----------
const yazilar = [
  ...manuel.map((y) => ({ k: y.tarih, tarih: anahtarTarih(y.tarih), baslik: y.baslik, yayin: y.yayin, kat: y.kategori, url: y.url })),
  ...substackYazilar.map((p) => ({ k: p.post_date.slice(0, 10), tarih: gunAy(p.post_date), baslik: p.title, yayin: 'Ortak Kürsü · yazı', kat: tahminKategori(p), url: p.canonical_url })),
].sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : 0));

function yaziListesiHTML() {
  let html = '', sonYil = '';
  for (const y of yazilar) {
    const yil = y.k.slice(0, 4);
    if (yil !== sonYil) { if (sonYil) html += '</ol></section>'; html += `<section class="yil" data-yil="${yil}"><h4 class="yil-baslik">${yil}</h4><ol class="yazi-listesi">`; sonYil = yil; }
    const baslik = y.url ? `<a href="${esc(y.url)}" class="yazi-baslik">${esc(y.baslik)}</a>` : `<span class="yazi-baslik">${esc(y.baslik)}</span>`;
    html += `<li class="yazi" data-kat="${y.kat}"><span class="yazi-tarih">${esc(y.tarih) || '&nbsp;'}</span><div class="yazi-govde">${baslik}<span class="yazi-yayin">${esc(y.yayin)}</span><span class="yazi-kat">${esc(katAd[y.kat] || '')}</span></div></li>`;
  }
  return html + '</ol></section>';
}
const sayac = (id) => yazilar.filter((y) => y.kat === id).length;
const filtreHTML = [`<button type="button" class="filtre" aria-pressed="true" data-kat="hepsi">Tümü · ${yazilar.length}</button>`,
  ...KATEGORILER.map((k) => `<button type="button" class="filtre" aria-pressed="false" data-kat="${k.id}">${esc(k.ad)} · ${sayac(k.id)}</button>`)].join('');

// ---------- Bölümler ----------
const oynat = '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5 13 8l-8.5 5.5Z" fill="currentColor"/></svg>';
const bolumHTML = bolumler.slice(0, 6).map((b) => `
<li><a class="bolum" href="${esc(b.canonical_url)}"><span class="bolum-oynat">${oynat}</span><span class="bolum-metin"><span class="bolum-ust">Bölüm ${b.no} · ${gunAy(b.post_date)}${b.podcast_duration ? ` · ${Math.round(b.podcast_duration / 60)} dk` : ''}</span><span class="bolum-ad">${esc(b.ad)}</span></span></a></li>`).join('');

const konusmaHTML = konusmalar.map((t) => t.video
  ? `<a class="kart konusma" href="${esc(t.video)}"><span class="etiket">${esc(t.zaman)}</span><h3>${esc(t.baslik)}</h3><p>${esc(t.yer)}</p><span class="oku">${oynat} Videoyu izle</span></a>`
  : `<article class="kart konusma"><span class="etiket">${esc(t.zaman)}</span><h3>${esc(t.baslik)}</h3><p>${esc(t.yer)}</p></article>`).join('\n');

// ---------- Logolar ----------
const LOGO = {
  spotify: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1DB954"/><path d="M6.2 9.3c3.9-1.2 8.3-.8 11.6 1.1M6.8 12.5c3.2-.9 6.7-.6 9.5 1M7.4 15.5c2.5-.7 5.1-.5 7.3.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000"/><path d="M10 8.7v6.6l5.6-3.3z" fill="#fff"/></svg>',
  youtubeMusic: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#FF0000"/><circle cx="12" cy="12" r="6.3" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M10.2 9.3v5.4l4.6-2.7z" fill="#fff"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#0A66C2"/><rect x="5" y="9.5" width="3" height="9" fill="#fff"/><circle cx="6.5" cy="6.5" r="1.8" fill="#fff"/><path d="M10.5 9.5h2.9v1.3c.5-.9 1.6-1.6 3.1-1.6 2.7 0 3.5 1.7 3.5 4.3v5h-3v-4.4c0-1.1-.2-2.2-1.6-2.2s-1.9 1-1.9 2.2v4.4h-3z" fill="#fff"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#000"/><path d="M6 6h3.3l9 12H15z" fill="#fff"/><path d="M17.3 6 12.9 11M11 13l-4.6 5" stroke="#fff" stroke-width="1.5"/></svg>',
  substack: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#FF6719"/><path d="M6.5 6h11v1.6h-11zM6.5 9.1h11v1.6h-11zM6.5 12.2h11V19l-5.5-3.1L6.5 19z" fill="#fff"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="16.1" cy="7.9" r="1" fill="#fff"/></svg>',
};
const sosyalHesaplar = [
  ['linkedin', 'LinkedIn', site.linkedin], ['youtube', 'YouTube', site.youtube], ['youtubeMusic', 'YouTube Music', site.youtubeMusic],
  ['spotify', 'Spotify', site.spotify], ['x', 'X', site.x], ['substack', 'Substack', site.substackAdres], ['instagram', 'Instagram', site.instagram],
].filter(([, , u]) => u);
const sosyalHTML = sosyalHesaplar.map(([k, ad, u]) => `<a class="sosyal-baglanti" href="${esc(u)}">${LOGO[k]}<span>${ad}</span></a>`).join('');

// ---------- Sayfa iskeleti ----------
const head = (baslik, aciklama, yol = '/') => `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(baslik)}</title>
<meta name="description" content="${esc(aciklama)}">
<link rel="canonical" href="https://ortakkursu.com${yol}">
<meta property="og:title" content="${esc(baslik)}">
<meta property="og:description" content="${esc(aciklama)}">
<meta property="og:image" content="https://ortakkursu.com/assets/og-image.jpg">
<meta property="og:url" content="https://ortakkursu.com${yol}">
<meta property="og:locale" content="tr_TR">
<link rel="icon" href="/favicon.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital@1&display=swap">
<link rel="stylesheet" href="/style.css">
</head>`;

const ust = `
<a class="atla" href="#icerik">İçeriğe geç</a>
<header class="ust">
<div class="kap ust-ic">
<a href="/" class="marka" aria-label="Ortak Kürsü ana sayfa"><span class="marka-ad">Ortak Kürsü</span></a>
<nav aria-label="Ana menü" class="menu">
<a href="/#bulten">Bülten</a><a href="/#podcast">Podcast</a><a href="/#yazilar">Raporlar ve yazılar</a><a href="/#konusmalar">Konuşmalar ve programlar</a><a href="/#hakkimda">Hakkımda</a><a href="/#abone" class="dugme dugme-vurgu">Abone ol</a>
</nav>
</div>
</header>`;

const alt = `
<footer class="alt">
<div class="kap alt-ic">
<span>© ${new Date().getFullYear()} Çiğdem Gizem Okkaoğlu · ortakkursu.com</span>
<span>Buradaki görüşler kişiseldir; görev yaptığım kurumları bağlamaz. · <a href="/aydinlatma-metni/">Aydınlatma Metni</a></span>
</div>
</footer>`;

const aydinlatmaMetni = `
<p>Veri sorumlusu Çiğdem Gizem Okkaoğlu'dur. Abonelik için yalnızca e-posta adresiniz alınır ve yalnızca Ortak Kürsü bülteni ile yeni yayın duyurularının gönderilmesi amacıyla, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 5. maddesi uyarınca açık rızanıza dayanılarak işlenir.</p>
<p>Bülten, Substack Inc. altyapısıyla gönderildiği için e-posta adresiniz Amerika Birleşik Devletleri'ndeki sunuculara aktarılır; aktarım Kanun'un 9. maddesine göre yapılır. Adresiniz başka bir amaçla kullanılmaz, üçüncü kişilerle paylaşılmaz ve aboneliğiniz sürdüğü müddetçe saklanır.</p>
<p>Rızanızı her bültenin altındaki bağlantıyla dilediğiniz an geri alabilirsiniz. Kanun'un 11. maddesindeki haklarınız için ${esc(site.iletisimEposta)} adresine yazabilirsiniz.</p>`;

const index = `${head('Ortak Kürsü · Çiğdem Gizem Okkaoğlu', 'Çiğdem Gizem Okkaoğlu: haftalık Teknoloji · Hukuk · Politika bülteni, Ortak Kürsü podcast, raporlar, yazılar ve konuşmalar.')}
<body>${ust}
<main id="icerik">

<section class="kahraman">
<h1 class="gizli">Ortak Kürsü · Çiğdem Gizem Okkaoğlu</h1>
<picture class="afis">
<source media="(max-width: 700px)" srcset="/assets/banner-dar.jpg" width="1000" height="563">
<img src="/assets/banner-genis.jpg" srcset="/assets/banner-genis-1200.jpg 1200w, /assets/banner-genis.jpg 1983w" sizes="100vw" width="1983" height="500" alt="Ortak Kürsü: Teknoloji · Hukuk · Politika. Kiremit rengi bir daire önünde siyah kürsü." fetchpriority="high">
</picture>
<div class="kap tanitim">
<div class="kisi"><div><p class="kisi-ad">Çiğdem Gizem Okkaoğlu</p><p class="kisi-unvan">Hukukçu · Teknoloji Politikaları Doktora Adayı · Endüstri Mühendisi</p></div></div>
<div class="dugmeler"><a href="/#bulten" class="dugme dugme-koyu">Son bülteni oku</a><a href="/#podcast" class="dugme dugme-cerceve-koyu">${oynat}Podcast'i dinle</a><a href="/#abone" class="dugme dugme-cerceve-koyu">Abone ol</a></div>
</div>
</section>

<section id="bulten" class="kap bolum-blok">
<div class="baslik-satir"><div><p class="ust-etiket koyu">Her pazar</p><h2>Haftalık bülten</h2></div><a href="${esc(site.substackAdres)}/archive" class="ok-baglanti">Tüm sayılar →</a></div>
<div class="sayilar">
${sayilar.slice(0, 12).map((x, i) => sayiKarti(x, i === 0)).join('\n')}
</div>
</section>

<section id="podcast" class="podcast">
<div class="kap podcast-ic">
<div class="podcast-sol">
<img src="/assets/logo.png" alt="Ortak Kürsü logosu: krem zemin üzerinde kiremit rengi daire önünde siyah bir kürsü" width="180" height="180" class="kapak">
<p class="ust-etiket">Podcast</p>
<h2>Ortak Kürsü</h2>
<p>Haftalık bir sohbet: gündemden tek bir mesele, açık açık ve tane tane. Kaynakları bölüm notlarında.</p>
<div class="dugmeler"><a href="${esc(site.spotify)}" class="dugme dugme-acik dugme-logo">${LOGO.spotify}Spotify'da dinle</a><a href="${esc(site.youtube)}" class="dugme dugme-acik dugme-logo">${LOGO.youtube}YouTube'da izle</a><a href="${esc(site.youtubeMusic)}" class="dugme dugme-acik dugme-logo">${LOGO.youtubeMusic}YouTube Music'te dinle</a></div>
</div>
<ol class="bolumler">${bolumHTML}</ol>
</div>
</section>

<section id="yazilar" class="kap bolum-blok">
<p class="ust-etiket koyu">Raporlar ve yazılar</p>
<h2>Uzun soluklu çalışmalar</h2>
<div class="rapor-izgara">
<a class="kart koyu-kart" href="https://www.toplum.org.tr/made-in-europe-ve-turkiye/"><span class="etiket">TÇE Raporu · 20 Ekim 2026</span><span class="rapor-baslik">"Made in Europe" ve Türkiye</span><span class="soluk-acik">Avrupa Birliği Sanayi Hızlandırma Yasası önerisi ve Türkiye için anlamı</span><span class="oku">Raporu oku →</span></a>
<a class="kart koyu-kart" href="https://www.toplum.org.tr/yeni-guc-mimarisi-dijital-hegemonya/"><span class="etiket">TÇE Raporu · No 27 · Ağustos 2026</span><span class="rapor-baslik">Yeni Güç Mimarisi: Dijital Hegemonya</span><span class="soluk-acik">İmran Gürakan ile birlikte · Dijital egemenlik ve Türkiye için politika seçenekleri</span><span class="oku">Raporu oku →</span></a>
<div class="kart"><span class="etiket">Yüksek lisans tezi · ODTÜ · 2025</span><span class="rapor-baslik kucuk-baslik">Regulation of Digital Markets: A Comparative Analysis of the EU Digital Markets Act and Its Implications for Competition Law in Türkiye</span></div>
</div>
<div class="baslik-satir tum-yazilar"><h3>Tüm yazılar <span class="soluk" id="sayac">(${yazilar.length})</span></h3><span class="soluk">En yeniden en eskiye</span></div>
<div class="filtreler" role="group" aria-label="Konuya göre filtrele">${filtreHTML}</div>
<div id="yazi-alani">${yaziListesiHTML()}</div>
</section>

<section id="konusmalar" class="kap bolum-blok">
<p class="ust-etiket koyu">Kürsüden</p>
<h2>Konuşmalar ve programlar</h2>
<div class="konusma-izgara">${konusmaHTML}</div>
<p class="soluk"><a href="${esc(site.youtube)}">Tüm konuşma kayıtları YouTube kanalında →</a></p>
</section>

<section id="hakkimda" class="kap bolum-blok">
<div class="hakkimda">
<div><p class="ust-etiket koyu">Hakkımda</p><h2>Çiğdem Gizem Okkaoğlu</h2><p class="soluk">Hukukçu · Teknoloji Politikaları Doktora Adayı · Endüstri Mühendisi</p></div>
<nav class="sosyal" aria-label="Sosyal medya hesapları">${sosyalHTML}</nav>
</div>
</section>

<section id="abone" class="abone">
<div class="kap abone-ic">
<div><h2>Her pazar, haftanın Teknoloji · Hukuk · Politika bülteni</h2><p>Bülten e-posta kutunuza gelsin; yeni podcast bölümlerinden de ilk siz haberdar olun.</p></div>
<div class="abone-form">
<label class="onay" for="kvkk"><input id="kvkk" type="checkbox"><span>Aydınlatma Metni'ni okudum. E-posta adresimin bülten gönderimi için işlenmesine ve bu amaçla Substack aracılığıyla yurt dışına aktarılmasına açık rıza veriyorum.</span></label>
<p class="onay-uyari" id="onay-uyari">Abonelik formu, onay kutusunu işaretlediğinizde açılır.</p>
<div id="substack-form" hidden><iframe title="Ortak Kürsü bülten abonelik formu" data-src="${esc(site.substackAdres)}/embed" width="100%" height="150" frameborder="0" scrolling="no"></iframe></div>
<details class="aydinlatma"><summary>Kişisel Verilerin Korunması Aydınlatma Metni</summary>${aydinlatmaMetni}</details>
</div>
</div>
</section>

</main>${alt}
<script src="/site.js" defer></script>
</body>
</html>
`;

const aydinlatmaSayfa = `${head('Aydınlatma Metni · Ortak Kürsü', 'Ortak Kürsü bülten aboneliği için kişisel verilerin korunması aydınlatma metni.', '/aydinlatma-metni/')}
<body>${ust}
<main id="icerik" class="kap bolum-blok metin-sayfa">
<h1>Kişisel Verilerin Korunması Aydınlatma Metni</h1>
${aydinlatmaMetni}
<p><a href="/#abone">← Aboneliğe dön</a></p>
</main>${alt}
</body>
</html>
`;

// ---------- Yaz ----------
if (existsSync('dist')) await rm('dist', { recursive: true });
await mkdir('dist/aydinlatma-metni', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('src/style.css', 'dist/style.css');
await cp('src/site.js', 'dist/site.js');
await writeFile('dist/index.html', index);
await writeFile('dist/aydinlatma-metni/index.html', aydinlatmaSayfa);
console.log(`Derlendi: ${sayilar.length} bülten sayısı, ${bolumler.length} podcast bölümü, ${yazilar.length} yazı.`);

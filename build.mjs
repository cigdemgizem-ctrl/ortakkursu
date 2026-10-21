// ortakkursu.com — site derleyici
// Çalıştırma: node build.mjs   → çıktı dist/ klasörüne yazılır.
// Substack'ten son bülten sayıları, podcast bölümleri ve yazılar çekilir;
// bağlantı kurulamazsa data/substack-onbellek.json kullanılır.

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SURUM = Date.now().toString(36);
const site = JSON.parse(await readFile('data/site.json', 'utf8'));
const manuel = JSON.parse(await readFile('data/yazilar.json', 'utf8')).yazilar;
const konusmalar = JSON.parse(await readFile('data/konusmalar.json', 'utf8')).konusmalar;
const raporlar = JSON.parse(await readFile('data/raporlar.json', 'utf8')).raporlar;
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
  return AYLAR[a - 1];
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
  return `<a class="kart sayi${buyuk ? ' sayi-buyuk' : ''}" href="${esc(s.canonical_url)}">${kapak ? `<span class="sayi-kapak"><img src="${esc(kapak)}" alt="Sayı ${s.no} kapak görseli" loading="${buyuk ? 'eager' : 'lazy'}" decoding="async" width="960" height="540"></span>` : ''}<span class="sayi-govde"><span class="etiket">${buyuk ? 'Son sayı · ' : ''}Sayı ${s.no}</span><span class="sayi-hafta">${haftaAraligi(s.yil, s.hafta)}</span>${ozetHTML}<span class="oku">Oku →</span></span></a>`;
}

// ---------- Yazılar listesi ----------
const yazilar = [
  ...manuel.map((y) => ({ k: y.tarih, tarih: anahtarTarih(y.tarih), baslik: y.baslik, yayin: y.yayin, kat: y.kategori, url: y.url })),
  ...substackYazilar.map((p) => ({ k: p.post_date.slice(0, 10), tarih: AYLAR[new Date(p.post_date).getUTCMonth()], baslik: p.title, yayin: 'Ortak Kürsü · Yazı', kat: tahminKategori(p), url: p.canonical_url })),
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
const bolumKarti = (b) => `
<li><a class="bolum" href="${esc(b.canonical_url)}"><span class="bolum-oynat">${oynat}</span><span class="bolum-metin"><span class="bolum-ust">Bölüm ${b.no} · ${gunAy(b.post_date)}${b.podcast_duration ? ` · ${Math.round(b.podcast_duration / 60)} dk` : ''}</span><span class="bolum-ad">${esc(b.ad)}</span></span></a></li>`;
const bolumHTML = bolumler.slice(0, 5).map(bolumKarti).join('');
const iso8601Sure = (sn) => `PT${Math.floor(sn / 60)}M${sn % 60}S`;
const PODCAST = {
  '@type': 'PodcastSeries', '@id': 'https://ortakkursu.com/podcast/#seri', name: 'Ortak Kürsü', url: 'https://ortakkursu.com/podcast/', inLanguage: 'tr-TR',
  description: 'Teknolojinin, hukukun ve politikanın aynı kürsüde buluştuğu haftalık podcast.', image: 'https://ortakkursu.com/assets/logo.png',
  author: { '@id': 'https://ortakkursu.com/#kisi' }, sameAs: [site.spotify, site.youtube, site.youtubeMusic],
};
const podcastBolumleri = bolumler.map((b) => ({
  '@type': 'PodcastEpisode', name: `Bölüm ${b.no}: ${b.ad}`, url: b.canonical_url, datePublished: b.post_date.slice(0, 10), episodeNumber: b.no,
  ...(b.podcast_duration ? { timeRequired: iso8601Sure(Math.round(b.podcast_duration)) } : {}), partOfSeries: { '@id': 'https://ortakkursu.com/podcast/#seri' }, inLanguage: 'tr-TR',
}));
const BULTEN = {
  '@type': 'CreativeWorkSeries', '@id': 'https://ortakkursu.com/bulten/#seri', name: 'Teknoloji · Hukuk · Politika', alternateName: 'Ortak Kürsü haftalık bülteni',
  url: 'https://ortakkursu.com/bulten/', inLanguage: 'tr-TR', author: { '@id': 'https://ortakkursu.com/#kisi' }, sameAs: [site.substackAdres],
  description: 'Her pazar yayımlanan haftalık teknoloji, hukuk ve politika bülteni.',
};
const bultenSayilari = { '@type': 'ItemList', name: 'Teknoloji · Hukuk · Politika bülten sayıları', itemListElement: sayilar.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: x.canonical_url, name: `Sayı ${x.no}: ${haftaAraligi(x.yil, x.hafta)}` })) };

const ytId = (u) => (String(u || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1] || '';
const saniye = (t) => String(t || '').split(':').reduce((top, x) => top * 60 + Number(x), 0);
const konusmaHTML = konusmalar.map((t) => {
  const id = ytId(t.video);
  const b = t.bolum && t.bolum.baslangic ? { ...t.bolum, bas: saniye(t.bolum.baslangic), son: t.bolum.bitis ? saniye(t.bolum.bitis) : 0 } : null;
  const ytLink = b ? `https://www.youtube.com/watch?v=${id}&t=${b.bas}s` : t.video;
  const bolumHTML = b ? `<button type="button" class="yt-bolum" data-bas="${b.bas}" data-son="${b.son}">${oynat}<span>${esc(b.etiket || 'Konuşmam')}: ${esc(b.baslangic)}${b.bitis ? `–${esc(b.bitis)}` : ''}</span></button>` : '';
  const metin = `<div class="konusma-metin"><span class="etiket">${esc(t.zaman)}</span><h3>${esc(t.baslik)}</h3><p>${esc(t.yer)}</p>${bolumHTML}${id ? `<a class="yt-dis" href="${esc(ytLink)}">YouTube'da aç ↗</a>` : ''}</div>`;
  if (!id) return `<li class="konusma konusma-videosuz">${metin}</li>`;
  return `<li class="konusma"><div class="yt" data-id="${id}"${b ? ` data-bas="${b.bas}" data-son="${b.son}"` : ''}><button type="button" class="yt-oynat" aria-label="${esc(t.baslik)} videosunu oynat"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="yt-dugme" aria-hidden="true"><svg viewBox="0 0 68 48" width="56" height="40"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3s-21.2 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#f00"/><path d="M45 24 27 14v20z" fill="#fff"/></svg></span></button></div>${metin}</li>`;
}).join('\n');

const raporHTML = raporlar.map((r) => `<li><a class="rapor" href="${esc(r.url)}">${r.kapak ? `<span class="rapor-kapak"><img src="${esc(r.kapak)}" alt="" loading="lazy" decoding="async" width="300" height="188"></span>` : `<span class="rapor-kapak rapor-rozet" aria-hidden="true">${/tez/i.test(r.etiket) ? 'Tez' : 'Rapor'}</span>`}<span class="rapor-metin"><span class="etiket">${esc(r.etiket)} · ${esc(r.tarih)}</span><span class="rapor-baslik">${esc(r.baslik)}</span>${r.aciklama ? `<span class="soluk">${esc(r.aciklama)}</span>` : ''}</span></a></li>`).join('\n');

// ---------- Logolar ----------
const LOGO = {
  spotify: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1DB954"/><path d="M6.2 9.3c3.9-1.2 8.3-.8 11.6 1.1M6.8 12.5c3.2-.9 6.7-.6 9.5 1M7.4 15.5c2.5-.7 5.1-.5 7.3.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000"/><path d="M10 8.7v6.6l5.6-3.3z" fill="#fff"/></svg>',
  youtubeMusic: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#FF0000"/><circle cx="12" cy="12" r="6.3" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M10.2 9.3v5.4l4.6-2.7z" fill="#fff"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#0A66C2"/><rect x="5" y="9.5" width="3" height="9" fill="#fff"/><circle cx="6.5" cy="6.5" r="1.8" fill="#fff"/><path d="M10.5 9.5h2.9v1.3c.5-.9 1.6-1.6 3.1-1.6 2.7 0 3.5 1.7 3.5 4.3v5h-3v-4.4c0-1.1-.2-2.2-1.6-2.2s-1.9 1-1.9 2.2v4.4h-3z" fill="#fff"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#000"/><path d="M6 6h3.3l9 12H15z" fill="#fff"/><path d="M17.3 6 12.9 11M11 13l-4.6 5" stroke="#fff" stroke-width="1.5"/></svg>',
  substack: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#FF6719"/><path d="M6.5 6h11v1.6h-11zM6.5 9.1h11v1.6h-11zM6.5 12.2h11V19l-5.5-3.1L6.5 19z" fill="#fff"/></svg>',
  eposta: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#161616"/><rect x="5" y="7" width="14" height="10" rx="1.5" fill="none" stroke="#DD8D68" stroke-width="1.6"/><path d="m5.5 7.8 6.5 5 6.5-5" fill="none" stroke="#DD8D68" stroke-width="1.6"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="16.1" cy="7.9" r="1" fill="#fff"/></svg>',
};
const sosyalHesaplar = [
  ['linkedin', 'LinkedIn', site.linkedin], ['youtube', 'YouTube', site.youtube], ['youtubeMusic', 'YouTube Music', site.youtubeMusic],
  ['spotify', 'Spotify', site.spotify], ['x', 'X', site.x], ['substack', 'Substack', site.substackAdres], ['instagram', 'Instagram', site.instagram], ['eposta', site.iletisimEposta, site.iletisimEposta && !site.iletisimEposta.startsWith('[') ? `mailto:${site.iletisimEposta}` : ''],
].filter(([, , u]) => u);
const sosyalHTML = sosyalHesaplar.map(([k, ad, u]) => `<a class="sosyal-baglanti" href="${esc(u)}">${LOGO[k]}<span>${ad}</span></a>`).join('');

// ---------- Sayfa iskeleti ----------
const SITE = 'https://ortakkursu.com';
const jsonLd = (dizi) => JSON.stringify({ '@context': 'https://schema.org', '@graph': dizi }).replace(/</g, '\\u003c');
const KISI = {
  '@type': 'Person', '@id': 'https://ortakkursu.com/#kisi', name: 'Çiğdem Gizem Okkaoğlu', url: 'https://ortakkursu.com/',
  image: 'https://ortakkursu.com/assets/logo.png',
  email: 'mailto:info@ortakkursu.com',
  description: 'Hukukçu, teknoloji politikaları doktora adayı ve endüstri mühendisi. Ortak Kürsü bülteni ve podcastinin yazarı ve sunucusu.',
  knowsAbout: ['Rekabet hukuku', 'Dijital piyasalar', 'Teknoloji politikası', 'Yapay zekâ yönetişimi', 'Dijital Piyasalar Yasası'],
  alumniOf: [{ '@type': 'CollegeOrUniversity', name: 'Orta Doğu Teknik Üniversitesi' }, { '@type': 'CollegeOrUniversity', name: 'Ankara Üniversitesi' }, { '@type': 'CollegeOrUniversity', name: 'Bilkent Üniversitesi' }],
  sameAs: [site.linkedin, site.youtube, site.youtubeMusic, site.spotify, site.x, site.substackAdres, site.instagram, 'https://www.toplum.org.tr/author/cigdem-gizem-okkaoglu/'].filter(Boolean),
};
const WEBSITE = { '@type': 'WebSite', '@id': 'https://ortakkursu.com/#site', name: 'Ortak Kürsü', alternateName: 'ortakkursu.com', url: 'https://ortakkursu.com/', inLanguage: 'tr-TR', publisher: { '@id': 'https://ortakkursu.com/#kisi' } };
const head = (baslik, aciklama, yol = '/', ekJsonLd = [], robots = 'index, follow, max-image-preview:large') => `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(baslik)}</title>
<meta name="description" content="${esc(aciklama)}">
<meta name="author" content="Çiğdem Gizem Okkaoğlu">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#161616">
<link rel="canonical" href="${SITE}${yol}">
<link rel="alternate" type="application/rss+xml" title="Ortak Kürsü bülteni" href="${esc(site.substackAdres)}/feed">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ortak Kürsü">
<meta property="og:title" content="${esc(baslik)}">
<meta property="og:description" content="${esc(aciklama)}">
<meta property="og:image" content="${SITE}/assets/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Ortak Kürsü: Teknoloji · Hukuk · Politika">
<meta property="og:url" content="${SITE}${yol}">
<meta property="og:locale" content="tr_TR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@cigdemokkaoglu">
<meta name="twitter:creator" content="@cigdemokkaoglu">
<meta name="twitter:title" content="${esc(baslik)}">
<meta name="twitter:description" content="${esc(aciklama)}">
<meta name="twitter:image" content="${SITE}/assets/og-image.jpg">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital@1&display=swap">
<link rel="stylesheet" href="/style.css?v=${SURUM}">
<script type="application/ld+json">${jsonLd([WEBSITE, KISI, ...ekJsonLd])}</script>
</head>`;

const ust = `
<a class="atla" href="#icerik">İçeriğe geç</a>
<header class="ust">
<div class="kap ust-ic">
<a href="/" class="marka" aria-label="Ortak Kürsü ana sayfa"><span class="marka-ad">Ortak Kürsü</span></a>
<nav aria-label="Ana menü" class="menu">
<a href="/#bulten">Bülten</a><a href="/#podcast">Podcast</a><a href="/#konusmalar">Konuşma ve Programlar</a><a href="/#yazilar">Rapor ve Yazılar</a><a href="/#iletisim">İletişim</a><a href="/#abone" class="dugme dugme-vurgu">Abone ol</a>
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
<p>Rızanızı her bültenin altındaki bağlantıyla dilediğiniz an geri alabilirsiniz. Kanun'un 11. maddesindeki haklarınız için <a href="mailto:${esc(site.iletisimEposta)}">${esc(site.iletisimEposta)}</a> adresine yazabilirsiniz.</p>`;

const index = `${head('Ortak Kürsü · Çiğdem Gizem Okkaoğlu | Teknoloji, Hukuk ve Politika', 'Çiğdem Gizem Okkaoğlu\'nun haftalık bülteni, Ortak Kürsü podcasti ve rekabet hukuku, dijital piyasalar ve yapay zekâ üzerine rapor, yazı ve konuşmaları.', '/', [PODCAST, BULTEN])}
<body>${ust}
<main id="icerik">

<section class="kahraman">
<h1 class="gizli">Ortak Kürsü: Çiğdem Gizem Okkaoğlu ile teknoloji, hukuk ve politika</h1>
<picture class="afis">
<source media="(max-width: 700px)" srcset="/assets/banner-dar.jpg" width="1000" height="563">
<img src="/assets/banner-genis.jpg" srcset="/assets/banner-genis-1200.jpg 1200w, /assets/banner-genis.jpg 1983w" sizes="100vw" width="1983" height="500" alt="Ortak Kürsü: Teknoloji · Hukuk · Politika. Kiremit rengi bir daire önünde siyah kürsü." fetchpriority="high">
</picture>
<div class="kap tanitim">
<div class="dugmeler"><a href="/#bulten" class="dugme dugme-koyu">Son bülteni oku</a><a href="/#podcast" class="dugme dugme-cerceve-koyu">${oynat}Podcast'i dinle</a><a href="/#abone" class="dugme dugme-cerceve-koyu">Abone ol</a></div>
</div>
</section>

<section id="bulten" class="kap bolum-blok">
<div class="baslik-satir"><div><p class="ust-etiket koyu">Her Pazar</p><h2>Haftalık Bülten</h2></div><a href="/bulten/" class="ok-baglanti">Tümünü gör →</a></div>
<div class="sayilar">
${sayilar.slice(0, 7).map((x, i) => sayiKarti(x, i === 0)).join('\n')}
</div>
</section>

<section id="podcast" class="kap bolum-blok podcast">
<div class="baslik-satir"><div><p class="ust-etiket koyu">Her Hafta</p><h2>Podcast</h2></div><a href="/podcast/" class="ok-baglanti">Tümünü gör →</a></div>
<div class="podcast-ic">
<div class="podcast-sol">
<img src="/assets/logo.png" alt="Ortak Kürsü logosu: krem zemin üzerinde kiremit rengi daire önünde siyah bir kürsü" width="180" height="180" class="kapak">
<p>Haftalık bir sohbet: gündemden tek bir mesele, açık açık ve tane tane. Kaynakları bölüm notlarında.</p>
<div class="dugmeler"><a href="${esc(site.spotify)}" class="dugme dugme-cerceve-koyu dugme-logo">${LOGO.spotify}Spotify'da dinle</a><a href="${esc(site.youtube)}" class="dugme dugme-cerceve-koyu dugme-logo">${LOGO.youtube}YouTube'da izle</a><a href="${esc(site.youtubeMusic)}" class="dugme dugme-cerceve-koyu dugme-logo">${LOGO.youtubeMusic}YouTube Music'te dinle</a></div>
</div>
<ol class="bolumler">${bolumHTML}</ol>
</div>
</section>

<section id="konusmalar" class="kap bolum-blok">
<p class="ust-etiket koyu">Kürsüden</p>
<h2>Konuşma ve Programlar</h2>
<ol class="konusma-listesi">${konusmaHTML}</ol>
<p class="soluk"><a href="${esc(site.youtube)}">Tüm konuşma kayıtları YouTube kanalında →</a></p>
</section>

<section id="yazilar" class="kap bolum-blok">
<p class="ust-etiket koyu">Uzun soluklu çalışmalar</p>
<h2>Rapor ve Yazılar</h2>
<ol class="rapor-listesi">${raporHTML}</ol>
<div class="baslik-satir tum-yazilar"><h3>Tüm yazılar <span class="soluk" id="sayac">(${yazilar.length})</span></h3><span class="soluk">En yeniden en eskiye</span></div>
<div class="filtreler" role="group" aria-label="Konuya göre filtrele">${filtreHTML}</div>
<div id="yazi-alani">${yaziListesiHTML()}</div>
</section>


<section id="iletisim" class="kap bolum-blok">
<div class="hakkimda">
<div><p class="ust-etiket koyu">İletişim</p><h2>Çiğdem Gizem Okkaoğlu</h2></div>
<nav class="sosyal" aria-label="Sosyal medya hesapları">${sosyalHTML}</nav>
</div>
</section>

<section id="abone" class="abone">
<div class="kap abone-ic">
<div><h2>Her hafta "Ortak Kürsü" bülteninin ve podcast yayınının e-posta adresinize iletilmesi için lütfen e-posta adresinizi giriniz:</h2></div>
<form class="abone-form" id="abone-formu" action="${esc(site.substackAdres)}/subscribe" method="get" novalidate>
<div class="eposta-satir">
<label for="eposta" class="gizli">E-posta adresiniz</label>
<input id="eposta" name="email" type="email" autocomplete="email" inputmode="email" placeholder="E-posta adresiniz" required>
<button type="submit" class="dugme dugme-koyu" id="abone-dugme" disabled>Abone ol</button>
</div>
<label class="onay" for="kvkk"><input id="kvkk" type="checkbox" disabled><span>Aydınlatma Metni'ni okudum. E-posta adresimin bülten gönderimi için işlenmesine ve bu amaçla Substack aracılığıyla yurt dışına aktarılmasına açık rıza veriyorum.</span></label>
<p class="abone-durum" id="abone-durum" role="status" aria-live="polite"></p>
<details class="aydinlatma"><summary>Kişisel Verilerin Korunması Aydınlatma Metni</summary>${aydinlatmaMetni}</details>
</form>
</div>
</div>
</section>

</main>${alt}
<script src="/site.js?v=${SURUM}" defer></script>
</body>
</html>
`;

const ekSayfa = (yol, baslik, aciklama, ust_, h2, govde, ekJsonLd = []) => `${head(baslik + ' · Ortak Kürsü', aciklama, yol, ekJsonLd)}
<body>${ust}
<main id="icerik" class="kap bolum-blok">
<p><a href="/" class="ok-baglanti">← Ana sayfa</a></p>
<div class="baslik-satir"><div><p class="ust-etiket koyu">${ust_}</p><h1 class="sayfa-baslik">${h2}</h1></div></div>
${govde}
</main>${alt}
<script src="/site.js?v=${SURUM}" defer></script>
</body>
</html>
`;
const aydinlatmaSayfa = `${head('Aydınlatma Metni · Ortak Kürsü', 'Ortak Kürsü bülten aboneliği için kişisel verilerin korunması aydınlatma metni.', '/aydinlatma-metni/', [], 'noindex, follow')}
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
const bugun = new Date().toISOString().slice(0, 10);
const sonSayiTarih = (sayilar[0]?.post_date || new Date().toISOString()).slice(0, 10);
const sonBolumTarih = (bolumler[0]?.post_date || new Date().toISOString()).slice(0, 10);
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}/</loc><lastmod>${bugun}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
<url><loc>${SITE}/bulten/</loc><lastmod>${sonSayiTarih}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
<url><loc>${SITE}/podcast/</loc><lastmod>${sonBolumTarih}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
`);
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
await writeFile('dist/404.html', `${head('Sayfa bulunamadı · Ortak Kürsü', 'Aradığınız sayfa bulunamadı.', '/404.html', [], 'noindex, follow')}
<body>${ust}
<main id="icerik" class="kap bolum-blok metin-sayfa"><h1>Aradığınız sayfa bulunamadı</h1><p>Bağlantı değişmiş ya da sayfa kaldırılmış olabilir.</p><p><a href="/">← Ana sayfaya dön</a></p></main>${alt}
</body>
</html>
`);
await mkdir('dist/bulten', { recursive: true });
await mkdir('dist/podcast', { recursive: true });
await writeFile('dist/bulten/index.html', ekSayfa('/bulten/', 'Haftalık Bülten Arşivi', 'Çiğdem Gizem Okkaoğlu\'nun her pazar yayımlanan Teknoloji · Hukuk · Politika bülteninin tüm sayıları: yapay zekâ, rekabet hukuku, dijital piyasalar ve Türkiye.', 'Her Pazar', 'Haftalık Bülten', `<div class="sayilar">${sayilar.map((x) => sayiKarti(x, false)).join('\n')}</div>`, [BULTEN, bultenSayilari]));
await writeFile('dist/podcast/index.html', ekSayfa('/podcast/', 'Podcast Bölümleri', 'Ortak Kürsü podcastinin tüm bölümleri: her hafta teknoloji, hukuk ve politikadan tek bir mesele, kaynaklarıyla ve Türkiye için ne anlama geldiğiyle.', 'Her Hafta', 'Podcast', `<div class="dugmeler" style="margin-bottom:24px"><a href="${esc(site.spotify)}" class="dugme dugme-cerceve-koyu dugme-logo">${LOGO.spotify}Spotify'da dinle</a><a href="${esc(site.youtube)}" class="dugme dugme-cerceve-koyu dugme-logo">${LOGO.youtube}YouTube'da izle</a><a href="${esc(site.youtubeMusic)}" class="dugme dugme-cerceve-koyu dugme-logo">${LOGO.youtubeMusic}YouTube Music'te dinle</a></div><ol class="bolumler">${bolumler.map(bolumKarti).join('')}</ol>`, [PODCAST, ...podcastBolumleri]));
console.log(`Derlendi: ${sayilar.length} bülten sayısı, ${bolumler.length} podcast bölümü, ${yazilar.length} yazı.`);

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
    }));
}

let gonderiler = onbellek;
try {
  const taze = await substackCek();
  if (taze.length) {
    const bySlug = new Map(onbellek.map((p) => [p.slug, p]));
    for (const p of taze) bySlug.set(p.slug, p);
    gonderiler = [...bySlug.values()];
    await writeFile('data/substack-onbellek.json', JSON.stringify(gonderiler, null, 2) + '\n');
    console.log(`Substack: ${taze.length} gönderi çekildi.`);
  }
} catch (e) {
  console.warn(`Substack'e ulaşılamadı (${e.message}); önbellek kullanılıyor.`);
}
gonderiler.sort((a, b) => (a.post_date < b.post_date ? 1 : -1));

const SAYI_RE = /Teknoloji\s*·\s*Hukuk\s*·\s*Politika\s*\((\d{4})\/(\d{1,2})\)/i;
const sayilar = [], bolumler = [], substackYazilar = [];
for (const p of gonderiler) {
  const m = p.title.match(SAYI_RE);
  if (m) sayilar.push({ ...p, no: `${m[1]}/${m[2]}` });
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
const sonSayi = sayilar[0];
const oncekiSayilar = sayilar.slice(1, 9);
const oynat = '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5 13 8l-8.5 5.5Z" fill="currentColor"/></svg>';
const bolumHTML = bolumler.slice(0, 6).map((b) => `
<li><a class="bolum" href="${esc(b.canonical_url)}"><span class="bolum-oynat">${oynat}</span><span class="bolum-metin"><span class="bolum-ust">Bölüm ${b.no} · ${gunAy(b.post_date)}${b.podcast_duration ? ` · ${Math.round(b.podcast_duration / 60)} dk` : ''}</span><span class="bolum-ad">${esc(b.ad)}</span></span></a></li>`).join('');

const konusmaHTML = konusmalar.map((t) => `
<article class="kart konusma"><span class="etiket">${esc(t.zaman)}</span><h3>${esc(t.baslik)}</h3><p>${esc(t.yer)}</p>${t.video ? `<a href="${esc(t.video)}">Videoyu izle →</a>` : ''}</article>`).join('');

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
<meta property="og:image" content="https://ortakkursu.com/assets/logo.png">
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
<a href="/" class="marka" aria-label="Ortak Kürsü ana sayfa"><span class="marka-ad">Ortak <span class="vurgu">—</span>Kürsü</span><span class="marka-alt">Teknoloji · Hukuk · Politika</span></a>
<nav aria-label="Ana menü" class="menu">
<a href="/#bulten">Bülten</a><a href="/#podcast">Podcast</a><a href="/#yazilar">Raporlar ve yazılar</a><a href="/#konusmalar">Konuşmalar</a><a href="/#hakkimda">Hakkımda</a><a href="/#abone" class="dugme dugme-vurgu">Abone ol</a>
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

const index = `${head('Ortak Kürsü · Çiğdem Gizem Okkaoğlu', 'Teknolojinin, hukukun ve politikanın aynı kürsüde buluştuğu yer. Haftalık bülten, podcast, raporlar ve yazılar.')}
<body>${ust}
<main id="icerik">

<section class="kahraman">
<div class="kap kahraman-ic">
<div class="kahraman-sol">
<p class="ust-etiket">Teknoloji · Hukuk · Politika</p>
<h1>Teknolojinin, hukukun ve politikanın aynı kürsüde buluştuğu yer.</h1>
<p class="giris">Her hafta tek bir meseleyi kaynaklarıyla birlikte ele alıyor, dünyadaki örneklerine bakıyor ve ülkemiz için ne anlama geldiğini soruyoruz.</p>
<div class="dugmeler"><a href="/#bulten" class="dugme dugme-acik">Son bülteni oku</a><a href="/#podcast" class="dugme dugme-cerceve">${oynat}Podcast'i dinle</a></div>
</div>
<div class="kahraman-sag">
<div class="kisi"><img src="/assets/logo.png" alt="" width="88" height="88" class="kisi-logo"><div><p class="kisi-ad">Çiğdem Gizem Okkaoğlu</p><p class="kisi-unvan">Hukukçu · Teknoloji Politikaları Doktora Adayı · Endüstri Mühendisi</p></div></div>
<p class="alinti">"Bu kürsüyü konuklarımla, çalışmalarından yararlandığım uzmanlarla ve sizlerle paylaşıyorum."</p>
<p class="kucuk">Bülten her pazar · ${esc(site.aboneSayisiMetni)}</p>
</div>
</div>
</section>

<section id="bulten" class="kap bolum-blok">
<div class="baslik-satir"><div><p class="ust-etiket koyu">Haftalık bülten</p><h2>Teknoloji · Hukuk · Politika</h2></div><a href="${esc(site.substackAdres)}/archive" class="ok-baglanti">Tüm sayılar →</a></div>
<div class="bulten-izgara">
${sonSayi ? `<a class="kart son-sayi" href="${esc(sonSayi.canonical_url)}"><span class="etiket">Son sayı · ${sonSayi.no}</span><span class="son-sayi-baslik">${esc(sonSayi.title)}</span><span class="soluk">${tarihMetni(sonSayi.post_date)}</span>${sonSayi.subtitle ? `<span class="soluk">${esc(sonSayi.subtitle)}</span>` : ''}<span class="oku">Oku →</span></a>` : ''}
<div class="kart onceki"><p class="etiket soluk-etiket">Önceki sayılar</p><ul>${oncekiSayilar.map((s) => `<li><a href="${esc(s.canonical_url)}"><span>Sayı ${s.no}</span><span class="soluk">${gunAy(s.post_date)}</span></a></li>`).join('')}</ul></div>
</div>
</section>

<section id="podcast" class="podcast">
<div class="kap podcast-ic">
<div class="podcast-sol">
<img src="/assets/logo.png" alt="Ortak Kürsü logosu: krem zemin üzerinde kiremit rengi daire önünde siyah bir kürsü" width="180" height="180" class="kapak">
<p class="ust-etiket">Podcast</p>
<h2>Ortak Kürsü</h2>
<p>Haftalık bir sohbet: gündemden tek bir mesele, açık açık ve tane tane. Kaynakları bölüm notlarında, dünyadaki örnekleri ve Türkiye'ye etkisi bölümün içinde.</p>
<div class="dugmeler"><a href="${esc(site.spotify)}" class="dugme dugme-acik">Spotify'da dinle</a><a href="${esc(site.youtube)}" class="dugme dugme-cerceve">YouTube'da izle</a><a href="${esc(site.youtubeMusic)}" class="dugme dugme-cerceve">YouTube Music'te dinle</a></div>
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
<p class="ust-etiket koyu">Konuşmalar ve paneller</p>
<h2>Kürsüden</h2>
<div class="konusma-izgara">${konusmaHTML}</div>
<p class="soluk"><a href="${esc(site.youtube)}">Tüm konuşma kayıtları YouTube kanalında →</a></p>
</section>

<section id="hakkimda" class="kap bolum-blok">
<div class="hakkimda">
<div><p class="ust-etiket koyu">Hakkımda</p><h2>Çiğdem Gizem Okkaoğlu</h2></div>
<div class="hakkimda-metin">
<p>Endüstri mühendisliğiyle başlayan yolum hukuka, iktisada ve teknoloji politikasına uzandı. Rekabet Kurumu'nda uzman olarak çalıştıktan sonra önde gelen hukuk bürolarında rekabet hukuku ve regülasyon alanında avukatlık yaptım; bugün uluslararası bir teknoloji şirketinde baş hukuk müşaviriyim.</p>
<p>ODTÜ Bilim ve Teknoloji Politikası Çalışmaları'nda doktora yapıyor, Toplum Çalışmaları Enstitüsü'nde Genel Sekreter olarak görev alıyorum. Ortak Kürsü'de kurumların dijital çağda nasıl düşündüğünü, nasıl karar verdiğini ve nasıl kapasite inşa ettiğini konuşuyorum.</p>
<p class="sosyal"><a href="${esc(site.x)}">X</a><a href="${esc(site.linkedin)}">LinkedIn</a><a href="${esc(site.substackAdres)}">Substack</a><a href="${esc(site.spotify)}">Spotify</a><a href="${esc(site.youtube)}">YouTube</a><a href="${esc(site.youtubeMusic)}">YouTube Music</a></p>
</div>
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

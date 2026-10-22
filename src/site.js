// Konuya göre filtre
(function () {
  var dugmeler = document.querySelectorAll('.filtre');
  var yazilar = document.querySelectorAll('.yazi');
  var yillar = document.querySelectorAll('.yil');
  var sayac = document.getElementById('sayac');
  dugmeler.forEach(function (d) {
    d.addEventListener('click', function () {
      var kat = d.getAttribute('data-kat');
      dugmeler.forEach(function (x) { x.setAttribute('aria-pressed', x === d ? 'true' : 'false'); });
      var gorunen = 0;
      yazilar.forEach(function (y) {
        var goster = kat === 'hepsi' || y.getAttribute('data-kat') === kat;
        y.hidden = !goster;
        if (goster) gorunen++;
      });
      yillar.forEach(function (yil) { yil.hidden = !yil.querySelector('.yazi:not([hidden])'); });
      if (sayac) sayac.textContent = '(' + gorunen + ')';
    });
  });
})();

// Abonelik: geçerli e-posta → onay kutusu açılır → onay → Abone ol
(function () {
  var form = document.getElementById('abone-formu');
  if (!form) return;
  var eposta = document.getElementById('eposta');
  var kutu = document.getElementById('kvkk');
  var dugme = document.getElementById('abone-dugme');
  var durum = document.getElementById('abone-durum');
  var adres = form.getAttribute('action').replace(/\/subscribe$/, '');
  var gecerli = function () { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta.value.trim()); };
  function guncelle() {
    var ok = gecerli();
    kutu.disabled = !ok;
    if (!ok) kutu.checked = false;
    dugme.disabled = !(ok && kutu.checked);
  }
  eposta.addEventListener('input', guncelle);
  kutu.addEventListener('change', guncelle);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!gecerli() || !kutu.checked) return;
    dugme.disabled = true;
    durum.textContent = 'Gönderiliyor…';
    var veri = new URLSearchParams({ email: eposta.value.trim(), first_url: location.href, current_url: location.href, source: 'ortakkursu.com' });
    fetch(adres + '/api/v1/free', { method: 'POST', mode: 'no-cors', body: veri })
      .then(function () {
        durum.innerHTML = 'Teşekkürler! Aboneliğinizi onaylamak için e-posta kutunuza gelen bağlantıya tıklayın. E-posta gelmezse aboneliği <a href="' + adres + '/subscribe" target="_blank" rel="noopener">buradan</a> tamamlayabilirsiniz.';
        form.reset(); guncelle();
      })
      .catch(function () {
        durum.innerHTML = 'Şu an gönderilemedi. Aboneliği <a href="' + adres + '/subscribe" target="_blank" rel="noopener">buradan</a> tamamlayabilirsiniz.';
        guncelle();
      });
  });
  guncelle();
})();

// Konuşma videoları: tıklanınca sayfada oynat (YouTube çerezsiz oynatıcı)
(function () {
  function oynat(kutu, bas, son) {
    var id = kutu.getAttribute('data-id');
    var q = 'autoplay=1&rel=0' + (bas ? '&start=' + bas : '') + (son ? '&end=' + son : '');
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?' + q;
    f.title = 'YouTube videosu';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    f.allowFullscreen = true;
    kutu.innerHTML = '';
    kutu.appendChild(f);
    var li = kutu.closest('.konusma');
    if (li) li.classList.add('konusma-acik');
  }
  document.querySelectorAll('.yt').forEach(function (kutu) {
    var dugme = kutu.querySelector('.yt-oynat');
    if (dugme) dugme.addEventListener('click', function () {
      oynat(kutu, Number(kutu.getAttribute('data-bas')) || 0, Number(kutu.getAttribute('data-son')) || 0);
    });
  });
  document.querySelectorAll('.yt-bolum').forEach(function (b) {
    b.addEventListener('click', function () {
      var kutu = b.closest('.konusma').querySelector('.yt');
      oynat(kutu, Number(b.getAttribute('data-bas')) || 0, Number(b.getAttribute('data-son')) || 0);
      kutu.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
})();

// Bülten kartları: sabit özet alanına tam sığan maddeleri göster; kalan boşluk
// en az iki satırsa bir sonraki maddeyi o kadar satırla "…" ile kısaltarak doldur
(function () {
  var listeler = document.querySelectorAll('.sayi:not(.sayi-buyuk) .sayi-ozet');
  if (!listeler.length) return;
  function sigdir() {
    listeler.forEach(function (ul) {
      var maddeler = [].slice.call(ul.querySelectorAll('li'));
      maddeler.forEach(function (li) { li.hidden = false; li.classList.remove('kisaltilmis'); li.style.removeProperty('-webkit-line-clamp'); });
      var kutu = ul.getBoundingClientRect();
      var satir = parseFloat(getComputedStyle(ul).lineHeight) || 23;
      var bosluk = parseFloat(getComputedStyle(ul).rowGap) || 8;
      var son = -1;
      for (var i = 0; i < maddeler.length; i++) {
        if (maddeler[i].getBoundingClientRect().bottom <= kutu.bottom + 1) son = i; else break;
      }
      if (son < 0) son = 0;
      var altSinir = maddeler[son].getBoundingClientRect().bottom;
      for (var j = son + 1; j < maddeler.length; j++) maddeler[j].hidden = true;
      var kalan = kutu.bottom - altSinir - bosluk;
      var satirSayisi = Math.floor(kalan / satir);
      if (son + 1 < maddeler.length && satirSayisi >= 1) {
        var li = maddeler[son + 1];
        li.hidden = false;
        li.classList.add('kisaltilmis');
        li.style.setProperty('-webkit-line-clamp', String(satirSayisi));
      }
    });
  }
  var zaman;
  window.addEventListener('resize', function () { clearTimeout(zaman); zaman = setTimeout(sigdir, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sigdir);
  window.addEventListener('load', sigdir);
  sigdir();
})();

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

// Abonelik: açık rıza verilmeden Substack formu yüklenmez
(function () {
  var kutu = document.getElementById('kvkk');
  var alan = document.getElementById('substack-form');
  var uyari = document.getElementById('onay-uyari');
  if (!kutu || !alan) return;
  var cerceve = alan.querySelector('iframe');
  kutu.addEventListener('change', function () {
    if (kutu.checked) {
      if (!cerceve.getAttribute('src')) cerceve.setAttribute('src', cerceve.getAttribute('data-src'));
      alan.hidden = false;
      if (uyari) uyari.hidden = true;
    } else {
      alan.hidden = true;
      if (uyari) uyari.hidden = false;
    }
  });
})();

// Konuşma videoları: tıklanınca sayfada oynat (YouTube çerezsiz oynatıcı)
(function () {
  document.querySelectorAll('.yt').forEach(function (kutu) {
    var dugme = kutu.querySelector('.yt-oynat');
    if (!dugme) return;
    dugme.addEventListener('click', function () {
      var id = kutu.getAttribute('data-id');
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      f.title = dugme.getAttribute('aria-label') || 'YouTube videosu';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      kutu.innerHTML = '';
      kutu.appendChild(f);
      var li = kutu.closest('.konusma');
      if (li) li.classList.add('konusma-acik');
    });
  });
})();

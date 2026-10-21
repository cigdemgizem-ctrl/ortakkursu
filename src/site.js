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

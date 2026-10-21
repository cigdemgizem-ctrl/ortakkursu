# ortakkursu.com

Çiğdem Gizem Okkaoğlu'nun kişisel sitesi: Ortak Kürsü bülteni, podcast, raporlar, yazılar ve konuşmalar.

## Neler kendiliğinden güncellenir?

Site her gün ve her pazar akşamı yeniden derlenir. Derleme sırasında Substack'ten şunlar çekilir:

- **Bülten:** Başlığı "Teknoloji · Hukuk · Politika (YYYY/NN)" olan gönderiler
- **Podcast:** Substack'e bağlı podcast bölümleri
- **Yazılar:** Bunların dışındaki Substack gönderileri, "Tüm yazılar" listesine eklenir

Substack'e ulaşılamazsa `data/substack-onbellek.json` kullanılır, site yine yayında kalır.

## Elle güncellenenler

| Ne | Dosya |
|---|---|
| TÇE raporları, makaleler, tez | `data/yazilar.json` |
| Konuşmalar ve paneller | `data/konusmalar.json` |
| Sosyal medya bağlantıları, iletişim e-postası, Substack yazılarının kategorisi | `data/site.json` |

Kategoriler: `dijital`, `yz`, `rekabet`, `egemenlik`, `toplum`.

## Yerelde derleme

```
node build.mjs
```

Çıktı `dist/` klasörüne yazılır.

## Yayın

Site GitHub Pages'te yayımlanır. `.github/workflows/yayin.yml` siteyi her gönderimde, her gün 07:17'de ve her pazar 20:47'de (Türkiye saati) yeniden derleyip yayımlar.

- Depo ayarlarında Settings → Pages → Source: "GitHub Actions" seçilidir.
- Özel alan adı: ortakkursu.com (`public/CNAME`).
- GoDaddy DNS: `@` için GitHub Pages'in dört A kaydı (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153), `www` için kullanıcıadı.github.io CNAME kaydı.

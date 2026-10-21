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

## Yayın ayarları (bir kez yapılır)

**Cloudflare Pages**
- Proje bu GitHub deposuna bağlanır.
- Derleme komutu: `node build.mjs`
- Çıktı klasörü: `dist`
- Ortam değişkeni: `NODE_VERSION` = `20`

**Alan adı**
- Cloudflare'de ortakkursu.com eklenir.
- GoDaddy'de alan adının ad sunucuları Cloudflare'in verdiği iki adresle değiştirilir.
- Pages projesinde "Custom domains" altından ortakkursu.com ve www.ortakkursu.com eklenir.

**Günlük güncelleme**
- Pages projesinde Settings → Builds → Deploy hooks altından bir kanca oluşturulur.
- Kanca adresi GitHub deposunda Settings → Secrets and variables → Actions altına `CLOUDFLARE_DEPLOY_HOOK` adıyla eklenir.

# UNO Online - Socket.io

## Kurulum

1. Node.js'in yüklü olduğundan emin olun
2. Terminal'de proje klasörüne gidin
3. Bağımlılıkları yükleyin:

```bash
npm install
```

## Çalıştırma

1. Server'ı başlatın:

```bash
npm start
```

2. Tarayıcıda `uno-client.html` dosyasını açın (iki farklı pencerede)

## Kullanım

### Oyuncu 1:
- Adını gir
- "Yeni Oda Oluştur" butonuna tıkla
- Oda kodunu arkadaşına gönder
- Arkadaşın katılmasını bekle

### Oyuncu 2:
- Adını gir
- "Odaya Katıl" butonuna tıkla
- Arkadaşından aldığı oda kodunu gir
- "Katıl" butonuna tıkla

## Özellikler

- ✅ Gerçek zamanlı multiplayer
- ✅ Socket.io ile anlık senkronizasyon
- ✅ Tüm UNO kuralları
- ✅ Özel kartlar (Skip, Reverse, +2, Wild, Wild+4)
- ✅ Otomatik kart çekme
- ✅ UNO çağrısı
- ✅ Kazanan ekranı
- ✅ Bağlantı durumu göstergesi

## Dosyalar

- `uno-client.html` - Client (UI)
- `uno-server.js` - Server (Oyun mantığı)
- `package.json` - Bağımlılıklar

// Minimale service worker: maakt de site installeerbaar en toont een nette
// melding als er geen verbinding is. Er wordt bewust NIETS van de pagina's
// bewaard: dit zijn persoonsgegevens (klanten, uren, rooster) en die horen niet
// in de cache van een telefoon te blijven staan.
const OFFLINE_HTML = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Geen verbinding</title><style>body{font-family:system-ui,sans-serif;background:#f4f5f2;color:#1c2521;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}button{margin-top:16px;padding:10px 18px;border:0;border-radius:8px;background:#2f6e63;color:#fff;font-size:15px}</style></head><body><div><h1 style="font-size:20px">Geen verbinding</h1><p>Controleer je internet en probeer het opnieuw.</p><button onclick="location.reload()">Opnieuw proberen</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});

"""
Grava demo do fluxo Instagram para envio ao Meta App Review.

Fluxo gravado:
  1. Admin > Instagram > Setup (mostra webhook + passo a passo)
  2. Admin > Instagram > Comentários (auto-resposta pública + DM)
  3. Admin > Instagram > Publicar (Story / Feed / Carousel)
  4. Admin > Instagram > Histórico (mídia publicada)
  5. Chat > Caixa de entrada > alterna WhatsApp | Instagram

Saída: /mnt/documents/meta-app-review-instagram.mp4
"""
import asyncio, json, os, subprocess
from pathlib import Path
from playwright.async_api import async_playwright

OUT_DIR = Path("/tmp/browser/ig-demo")
OUT_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_DIR = OUT_DIR / "video"
VIDEO_DIR.mkdir(exist_ok=True)
FINAL_MP4 = Path("/mnt/documents/meta-app-review-instagram.mp4")

CAPTIONS = [
    ("Admin Instagram — configuração da conta business", 4),
    ("Webhook receptor de DMs, comentários e mentions", 3),
    ("Auto-resposta pública em comentários (instagram_business_manage_comments)", 5),
    ("Envio de DM privada ao autor do comentário", 4),
    ("Publicação de Story / Feed / Carrossel (instagram_business_content_publish)", 5),
    ("Caixa de entrada unificada — abas WhatsApp | Instagram", 5),
    ("Instagram Direct integrado ao mesmo pipeline de IA + humano", 5),
]

async def caption(page, text, ms=1500):
    await page.evaluate(
        """(t) => {
            let el = document.getElementById('__demo_caption');
            if (!el) {
                el = document.createElement('div');
                el.id = '__demo_caption';
                el.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#F26B1F,#ec4899);color:white;padding:14px 28px;border-radius:14px;font:600 18px system-ui;box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:99999;max-width:80vw;text-align:center';
                document.body.appendChild(el);
            }
            el.textContent = t;
        }""",
        text,
    )
    await page.wait_for_timeout(ms)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            record_video_dir=str(VIDEO_DIR),
            record_video_size={"width": 1280, "height": 800},
        )
        page = await context.new_page()

        # Restaura sessão Supabase se injetada
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = "http://localhost:8080"
            await context.add_cookies(cookies)

        await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
        if storage_key and session_json:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
            )

        # 1. Setup
        await page.goto("http://localhost:8080/admin/instagram", wait_until="networkidle")
        await caption(page, "VIA AIR — Instagram Business Integration")
        await page.wait_for_timeout(2500)
        await caption(page, "Configuração da conta e webhook Meta Graph API")
        await page.wait_for_timeout(3500)

        # 2. Comments
        try:
            await page.get_by_role("tab", name="Comentários").click(timeout=3000)
            await caption(page, "Auto-resposta em comentários públicos + DM privada")
            await page.wait_for_timeout(4500)
        except Exception as e:
            print("comments tab skipped:", e)

        # 3. Publish
        try:
            await page.get_by_role("tab", name="Publicar").click(timeout=3000)
            await caption(page, "Publicação de Story / Feed / Carrossel via /media_publish")
            await page.wait_for_timeout(4500)
        except Exception as e:
            print("publish tab skipped:", e)

        # 4. History
        try:
            await page.get_by_role("tab", name="Histórico").click(timeout=3000)
            await caption(page, "Histórico de publicações rastreadas no banco")
            await page.wait_for_timeout(3500)
        except Exception as e:
            print("history tab skipped:", e)

        # 5. Inbox tabs
        await page.goto("http://localhost:8080/chat/inbox", wait_until="networkidle")
        await caption(page, "Caixa de entrada unificada — WhatsApp + Instagram")
        await page.wait_for_timeout(3500)
        try:
            await page.get_by_role("button", name=lambda n: "Instagram" in (n or "")).first.click(timeout=3000)
            await caption(page, "Aba Instagram — Direct Messages integrados")
            await page.wait_for_timeout(3500)
        except Exception as e:
            print("ig tab click skipped:", e)

        await caption(page, "Fim da demonstração • Permissões: basic, messages, comments, content_publish")
        await page.wait_for_timeout(3000)

        await context.close()
        await browser.close()

        # Junta os WebM em MP4
        webms = sorted(VIDEO_DIR.glob("*.webm"))
        if not webms:
            print("Nenhum vídeo gerado")
            return
        # Lista pro ffmpeg concat
        list_file = OUT_DIR / "list.txt"
        list_file.write_text("\n".join(f"file '{w.absolute()}'" for w in webms))
        FINAL_MP4.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", "-an",
            str(FINAL_MP4),
        ], check=True, capture_output=True)
        print(f"Vídeo salvo: {FINAL_MP4} ({FINAL_MP4.stat().st_size // 1024} KB)")

asyncio.run(main())

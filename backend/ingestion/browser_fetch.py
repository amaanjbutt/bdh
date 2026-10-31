"""Browser-assisted download for publishers behind F5/WAF rules.

Some Bangladesh Bank file paths (the current Monthly Economic Trends Excel/PDF)
and a few other government downloads reject plain HTTP clients even with a
browser TLS fingerprint. A real Chromium navigation *does* receive the file —
F5's JS challenge runs and the browser download starts. This helper drives
Playwright with an installed Chrome/Chromium and returns the bytes.

Used only when `BROWSER_FETCH=1` (or `AUTO_BROWSER_FETCH=1`); ordinary HTTP stays
on curl_cffi so ingestion remains cheap and headless.
"""
from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path

_CHROME_CANDIDATES = [
    os.getenv("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


def _chrome() -> str | None:
    for p in _CHROME_CANDIDATES:
        if p and Path(p).exists():
            return p
    return shutil.which("chrome") or shutil.which("chromium") or shutil.which("msedge")


async def _download_async(url: str, timeout_ms: int = 90_000) -> bytes | None:
    from playwright.async_api import async_playwright

    exe = _chrome()
    if not exe:
        return None
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=exe)
        ctx = await browser.new_context(accept_downloads=True)
        page = await ctx.new_page()
        downloads = []
        page.on("download", lambda d: downloads.append(d))
        try:
            await page.goto(url, wait_until="commit", timeout=timeout_ms)
        except Exception:
            # Chromium raises "Download is starting" for a direct file navigation;
            # the download event is still emitted. Other errors fall through.
            pass
        loops = max(1, timeout_ms // 500)
        for _ in range(loops):
            if downloads:
                break
            await page.wait_for_timeout(500)
        data = None
        if downloads:
            d = downloads[0]
            path = await d.path()
            if path:
                data = Path(path).read_bytes()
        await browser.close()
        return data


def download(url: str, timeout_ms: int = 90_000) -> bytes | None:
    """Return the downloaded bytes, or None when browser fetch is unavailable."""
    if os.getenv("BROWSER_FETCH", "0") not in {"1", "true", "yes"}:
        return None
    try:
        return asyncio.run(_download_async(url, timeout_ms))
    except Exception:
        return None

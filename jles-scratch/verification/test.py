import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    extension_path = os.path.abspath('.')
    user_data_dir = '/tmp/test-user-data'

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=[
                f'--disable-extensions-except={extension_path}',
                f'--load-extension={extension_path}',
            ],
        )

        # Go to the test page
        page = await context.new_page()
        await page.goto(f'file://{os.path.abspath("jles-scratch/verification/video.html")}')

        # Directly trigger PiP and store the tab ID
        await page.evaluate(
            """
            async () => {
                const video = document.getElementById('video');
                if (video.readyState >= 1) {
                    await video.requestPictureInPicture();
                } else {
                    await new Promise(resolve => {
                        video.addEventListener('loadedmetadata', async () => {
                            await video.requestPictureInPicture();
                            resolve();
                        }, { once: true });
                    });
                }
            }
            """
        )

        # Find the extension's background page
        background_page = None
        for i in range(10):
            if len(context.service_workers) > 0:
                background_page = context.service_workers[0]
                break
            await asyncio.sleep(0.5)

        if not background_page:
            print("Could not find extension background page or service worker.")
            await context.close()
            return

        await background_page.evaluate(
            """
            () => {
                chrome.storage.local.set({ pipTabId: 1 });
            }
            """
        )

        # Wait for the PiP window to open
        await asyncio.sleep(2)

        # Trigger the "Quit PiP" command
        await page.keyboard.press('Control+Shift+K')

        # Wait for the PiP window to close
        await asyncio.sleep(2)

        await page.screenshot(path="jles-scratch/verification/screenshot.png")

        # Check if the video is paused
        is_paused = await page.evaluate("document.getElementById('video').paused")

        if is_paused:
            print("Test passed: Video is paused after quitting PiP.")
        else:
            print("Test failed: Video is not paused after quitting PiP.")

        await context.close()

if __name__ == '__main__':
    asyncio.run(main())
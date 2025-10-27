import asyncio
from playwright.sync_api import sync_playwright
import os
import json

def run():
    with sync_playwright() as p:
        extension_path = os.path.abspath('.')

        user_data_dir = "/tmp/playwright_user_data"
        context = p.chromium.launch_persistent_context(user_data_dir,
            headless=True,
            args=[
                f"--disable-extensions-except={extension_path}",
                f"--load-extension={extension_path}",
            ]
        )

        # Open a page where the content script will be injected.
        page = context.new_page()
        page.goto("https://example.com")

        # Give the content script time to load.
        page.wait_for_timeout(1000)

        # Send a message from the content script to activate the service worker.
        page.evaluate("chrome.runtime.sendMessage({type: 'getCurrentTabId'})")

        # Wait for the service worker to be created and get it.
        service_worker = context.wait_for_event('serviceworker')
        extension_id = service_worker.url.split('/')[2]

        # Now, open the options page in the extension's context.
        options_page_url = f"chrome-extension://{extension_id}/src/options/index.html"
        options_page = context.new_page()
        options_page.goto(options_page_url)

        # Define a highlight rule.
        rule = {
            'id': 'test-rule-1',
            'pattern': '*',  # Match all URLs
            'type': 'whole-phrase',
            'value': 'highlighted',
            'textColor': '#000000',
            'backgroundColor': '#ffff00',
            'bold': True,
            'italic': False,
            'underline': False,
            'ignoreCase': True,
        }

        # Use page.evaluate on the options page to set the rule in chrome.storage.sync.
        options_page.evaluate(f"""
            (async () => {{
                await chrome.storage.sync.set({{ 'highlightTextRules': [{json.dumps(rule)}] }});
            }})();
        """)
        options_page.close()

        # Now, open the actual test page.
        test_html_path = os.path.abspath('jules-scratch/verification/test.html')
        page.goto(f"file://{test_html_path}")

        # Add content to the page to trigger the mutation observer and highlighting.
        page.evaluate("""() => {
            const content = document.getElementById('content');
            const newElement = document.createElement('p');
            newElement.textContent = 'This is some new text that should be highlighted if it matches a rule.';
            content.appendChild(newElement);
        }""")

        # Give the debounced highlighting time to apply.
        page.wait_for_timeout(500)

        page.screenshot(path="jules-scratch/verification/verification.png")

        context.close()

if __name__ == "__main__":
    run()

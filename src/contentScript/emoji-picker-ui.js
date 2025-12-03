/**
 * Emoji Picker UI Script
 * Handles the emoji picker component inside the iframe
 */

import Picker from '../libs/emoji-picker-element.js';

// Register the custom element
if (!customElements.get('emoji-picker')) {
  customElements.define('emoji-picker', Picker);
}

let port = null;

// Create the picker
const wrapper = document.getElementById('picker-wrapper');
const backdrop = document.getElementById('backdrop');
const picker = document.createElement('emoji-picker');

// Handle emoji selection
picker.addEventListener('emoji-click', (event) => {
  const detail = event.detail;
  if (detail && detail.unicode && port) {
    port.postMessage({
      what: 'emojiSelected',
      emoji: detail.unicode
    });
  }
});

wrapper.appendChild(picker);

// Handle backdrop click
backdrop.addEventListener('click', () => {
  if (port) {
    port.postMessage({ what: 'close' });
  }
});

// Handle keyboard events
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (port) {
      port.postMessage({ what: 'close' });
    }
  }
});

// Focus search input
setTimeout(() => {
  const searchInput = picker.shadowRoot?.querySelector('input[type="search"]');
  if (searchInput) {
    searchInput.focus();
  }
}, 100);

// Handle message channel setup
window.addEventListener('message', (event) => {
  if (event.data && event.data.what === 'emojiPickerStart') {
    port = event.ports[0];
    port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.what === 'close') {
        // Cleanup if needed
      }
    };
    
    // Notify parent that we're ready
    port.postMessage({ what: 'ready' });
  }
});


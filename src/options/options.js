import './theme.js';
import './bookmarks.js';
import './backup.js';
import './notifications.js';
import './importExport.js';
import './autoReload.js';
import './brightMode.js';
import './highlightText.js';
import './blockElements.js';
import './customCode.js';
import './llmPrompts.js';
import './urlProcessRules.js';
import './debug.js';

/**
 * Navigation functionality for the options page
 */
class NavigationManager {
  constructor() {
    this.navLinks = document.querySelectorAll('.nav-link');
    this.sections = document.querySelectorAll('.section-content');
    this.init();
  }

  init() {
    this.setupSectionSwitching();
    this.handleInitialHash();
    this.setupPopStateHandler();
  }

  /**
   * Show a specific section and hide all others
   * @param {string} sectionId - The ID of the section to show
   */
  showSection(sectionId) {
    // Hide all sections
    this.sections.forEach((section) => {
      section.setAttribute('hidden', 'true');
    });

    // Show the target section
    const targetSection = document.querySelector(
      `[data-section="${sectionId}"]`,
    );
    if (targetSection) {
      targetSection.removeAttribute('hidden');
    }

    // Update active link
    this.updateActiveLink(sectionId);
  }

  /**
   * Setup section switching for navigation links
   */
  setupSectionSwitching() {
    this.navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;

        const targetId = href.substring(1);

        // Update URL hash
        window.history.pushState(null, '', `#${targetId}`);

        // Show the selected section
        this.showSection(targetId);
      });
    });
  }

  /**
   * Update the active navigation link
   * @param {string} sectionId - The ID of the active section
   */
  updateActiveLink(sectionId) {
    this.navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;

      const linkTarget = href.substring(1);
      if (linkTarget === sectionId) {
        link.classList.add('bg-primary', 'text-primary-content');
        link.classList.remove('hover:bg-base-200');
      } else {
        link.classList.remove('bg-primary', 'text-primary-content');
        link.classList.add('hover:bg-base-200');
      }
    });
  }

  /**
   * Handle initial hash in URL
   */
  handleInitialHash() {
    if (window.location.hash) {
      const targetId = window.location.hash.substring(1);
      this.showSection(targetId);
    } else {
      // Default to first section if no hash
      const firstSection = this.sections[0];
      if (firstSection) {
        const sectionId = firstSection.getAttribute('data-section');
        if (sectionId) {
          this.showSection(sectionId);
        }
      }
    }
  }

  /**
   * Setup popstate handler for browser back/forward navigation
   */
  setupPopStateHandler() {
    window.addEventListener('popstate', () => {
      this.handleInitialHash();
    });
  }
}

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new NavigationManager();
});

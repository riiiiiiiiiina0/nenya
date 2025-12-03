import './theme.js';
import '../shared/iconUrl.js';
import './bookmarks.js';
import './backup.js';
import './pinnedShortcuts.js';
import './notifications.js';
import './importExport.js';
import './autoReload.js';
import './darkMode.js';
import './brightMode.js';
import './highlightText.js';
import './blockElements.js';
import './customCode.js';
import './llmPrompts.js';
import './urlProcessRules.js';
import './screenshots.js';
import './autoGoogleLogin.js';
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
    // Hide all sections first to prevent showing all at once
    this.sections.forEach((section) => {
      section.classList.remove('active');
    });

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
      section.classList.remove('active');
    });

    // Show the target section
    const targetSection = document.querySelector(
      `.section-content[data-section="${sectionId}"]`,
    );
    if (targetSection) {
      targetSection.classList.add('active');
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
        link.classList.add('active');
        link.style.backgroundColor = 'rgba(124, 58, 237, 0.2)';
        link.style.color = '#7c3aed';
        link.style.fontWeight = '600';
        link.style.borderLeft = '3px solid #7c3aed';
        link.style.borderRadius = '0.75rem';
      } else {
        link.classList.remove('active');
        link.style.backgroundColor = '';
        link.style.color = '';
        link.style.fontWeight = '';
        link.style.borderLeft = '';
        link.style.borderRadius = '';
      }
    });
  }

  /**
   * Handle initial hash in URL
   */
  handleInitialHash() {
    if (window.location.hash) {
      const targetId = window.location.hash.substring(1).split('&')[0];
      this.showSection(targetId);
    } else {
      // Default to first section if no hash
      const firstSection = this.sections[0];
      if (firstSection) {
        const sectionId = firstSection.getAttribute('data-section');
        if (sectionId) {
          // Update URL hash to match the default section
          window.history.replaceState(null, '', `#${sectionId}`);
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

  /**
   * Re-apply section visibility based on current hash or default section
   * Useful after external code may have changed section visibility
   */
  reapplySectionVisibility() {
    // Hide all sections first
    this.sections.forEach((section) => {
      section.classList.remove('active');
    });

    // Then show the correct section based on hash or default
    this.handleInitialHash();
  }
}

// Store NavigationManager instance globally so other modules can access it
let navigationManagerInstance;

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  navigationManagerInstance = new NavigationManager();

  // Make it accessible globally for other modules
  window.navigationManager = navigationManagerInstance;

  // Re-apply section visibility after a short delay to ensure all modules have initialized
  // This handles cases where login verification happens after DOMContentLoaded
  setTimeout(() => {
    if (navigationManagerInstance) {
      navigationManagerInstance.reapplySectionVisibility();
    }
  }, 100);
});

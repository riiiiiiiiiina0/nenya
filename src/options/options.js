import './theme.js';
import './bookmarks.js';
import './backup.js';
import './notifications.js';
import './importExport.js';
import './autoReload.js';
import './brightMode.js';

/**
 * Navigation functionality for the options page
 */
class NavigationManager {
  constructor() {
    this.navLinks = document.querySelectorAll('.nav-link');
    this.sections = document.querySelectorAll('section[aria-labelledby]');
    this.init();
  }

  init() {
    this.setupSmoothScrolling();
    this.setupActiveLinkHighlighting();
    this.handleInitialHash();
  }

  /**
   * Scroll to a section
   * @param {HTMLElement} element
   */
  scrollToSection(element) {
    const section = element.closest('section');
    if (!section) return;

    // Calculate offset for sticky navbar (assuming navbar height is 4rem = 64px)
    const navbarHeight = 80;
    const targetPosition = section.offsetTop - navbarHeight;
    console.log('targetPosition', targetPosition, element);

    // Smooth scroll to target with offset
    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth',
    });
  }

  /**
   * Setup smooth scrolling for navigation links
   */
  setupSmoothScrolling() {
    this.navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;
        
        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          // Update URL hash
          window.history.pushState(null, '', `#${targetId}`);
          
          this.scrollToSection(targetElement);
        }
      });
    });
  }

  /**
   * Setup active link highlighting based on scroll position
   */
  setupActiveLinkHighlighting() {
    const observerOptions = {
      root: null,
      rootMargin: '-10% 0px -80% 0px',
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('aria-labelledby');
          if (sectionId) {
            this.updateActiveLink(sectionId);
          }
        }
      });
    }, observerOptions);

    this.sections.forEach(section => {
      observer.observe(section);
    });
  }

  /**
   * Update the active navigation link
   * @param {string} sectionId - The ID of the active section
   */
  updateActiveLink(sectionId) {
    this.navLinks.forEach(link => {
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
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
          this.scrollToSection(targetElement);
        }, 100);
      }
    }
  }
}

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new NavigationManager();
});

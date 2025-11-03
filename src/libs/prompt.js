const Prompts = (function () {
  /**
   * Check if dark mode is active
   * @returns {boolean}
   */
  function isDarkMode() {
    // Check for data-theme attribute first (DaisyUI)
    if (typeof document !== 'undefined' && document.documentElement) {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme === 'dark') {
        return true;
      }
      if (theme === 'light') {
        return false;
      }
    }
    // Fallback to system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  }

  /**
   * Get dialog styles based on current theme
   * @returns {Object}
   */
  function getDialogStyle() {
    const dark = isDarkMode();
    return {
      border: "none",
      borderRadius: "6px",
      padding: "20px",
      margin: "auto",
      width: "100%",
      maxWidth: "90%",
      boxSizing: "border-box",
      fontFamily: "sans-serif",
      boxShadow: dark ? "0 2px 10px rgba(0,0,0,0.5)" : "0 2px 10px rgba(0,0,0,0.2)",
      background: dark ? "#1f2937" : "#fff",
      color: dark ? "#f9fafb" : "#000",
    };
  }

  /**
   * Get message styles based on current theme
   * @returns {Object}
   */
  function getMessageStyle() {
    const dark = isDarkMode();
    return {
      marginBottom: "20px",
      fontSize: "16px",
      color: dark ? "#e5e7eb" : "#333",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
    };
  }

  const buttonRowStyle = {
    textAlign: "right",
    marginTop: "20px",
  };

  /**
   * Get button styles based on current theme
   * @returns {Object}
   */
  function getButtonStyle() {
    const dark = isDarkMode();
    return {
      backgroundColor: dark ? "#3b82f6" : "#007bff",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      padding: "8px 12px",
      fontSize: "14px",
      cursor: "pointer",
      marginLeft: "8px",
    };
  }

  /**
   * Get cancel button styles based on current theme
   * @returns {Object}
   */
  function getCancelButtonStyle() {
    const dark = isDarkMode();
    return {
      backgroundColor: dark ? "#4b5563" : "#6c757d",
    };
  }

  /**
   * Get input styles based on current theme
   * @returns {Object}
   */
  function getInputStyle() {
    const dark = isDarkMode();
    return {
      width: "100%",
      boxSizing: "border-box",
      padding: "8px",
      fontSize: "16px",
      marginBottom: "10px",
      borderRadius: "4px",
      border: dark ? "1px solid #4b5563" : "1px solid #ccc",
      background: dark ? "#374151" : "#fff",
      color: dark ? "#f9fafb" : "#000",
    };
  }

  function applyStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  function createDialog(message) {
    const dialog = document.createElement("dialog");
    applyStyles(dialog, getDialogStyle());
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const form = document.createElement("form");
    form.method = "dialog"; // Allows form to close the dialog on submission.

    const msg = document.createElement("div");
    applyStyles(msg, getMessageStyle());
    msg.textContent = message;

    form.appendChild(msg);
    dialog.appendChild(form);

    return { dialog, form };
  }

  /**
   * @param {string} label
   * @param {string} value
   * @param {Object} customStyles
   * @param {"button" | "submit" | "reset"} type
   */
  function createButton(label, value, customStyles = {}, type = "submit") {
    const btn = document.createElement("button");
    applyStyles(btn, getButtonStyle());
    applyStyles(btn, customStyles);
    btn.type = type;
    btn.value = value; // form submission will set dialog.returnValue to this
    btn.textContent = label;
    return btn;
  }

  /**
   * @param {string} message
   * @returns {Promise<void>}
   */
  async function alert(message) {
    return new Promise((resolve) => {
      const { dialog, form } = createDialog(message);

      const buttonRow = document.createElement("div");
      applyStyles(buttonRow, buttonRowStyle);

      const okBtn = createButton("OK", "ok");
      buttonRow.appendChild(okBtn);
      form.appendChild(buttonRow);

      dialog.addEventListener("close", () => {
        resolve();
        dialog.remove();
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      okBtn.focus();
    });
  }

  async function confirm(message) {
    return new Promise((resolve) => {
      const { dialog, form } = createDialog(message);

      const buttonRow = document.createElement("div");
      applyStyles(buttonRow, buttonRowStyle);

      const cancelBtn = createButton("Cancel", "cancel", getCancelButtonStyle());
      const okBtn = createButton("OK", "ok");

      buttonRow.appendChild(cancelBtn);
      buttonRow.appendChild(okBtn);
      form.appendChild(buttonRow);

      dialog.addEventListener("close", () => {
        // dialog.returnValue will be "ok", "cancel", or "" (if ESC pressed)
        const val = dialog.returnValue;
        resolve(val === "ok");
        dialog.remove();
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      // Set focus to the OK button so pressing Enter will confirm
      okBtn.focus();
    });
  }

  async function prompt(message, defaultValue = "") {
    return new Promise((resolve) => {
      const { dialog, form } = createDialog(message);

      const input = document.createElement("input");
      applyStyles(input, getInputStyle());
      input.type = "text";
      input.name = "promptInput";
      input.value = defaultValue;

      form.appendChild(input);

      const buttonRow = document.createElement("div");
      applyStyles(buttonRow, buttonRowStyle);

      const cancelBtn = createButton("Cancel", "cancel", getCancelButtonStyle(), "button");
      const okBtn = createButton("OK", "ok");

      buttonRow.appendChild(cancelBtn);
      buttonRow.appendChild(okBtn);
      form.appendChild(buttonRow);

      cancelBtn.addEventListener("click", () => {
        dialog.close("");
      });
      dialog.addEventListener("close", () => {
        const val = dialog.returnValue === "ok" ? input.value : null;
        resolve(val);
        dialog.remove();
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      input.focus();
      // Select all text if there's a default value for easier editing
      if (defaultValue) {
        input.select();
      }
    });
  }

  return { alert, confirm, prompt };
})();

// Expose Prompts globally for use in modules
if (typeof window !== 'undefined') {
  // @ts-ignore - Prompts is intentionally exposed on window
  window.Prompts = Prompts;
}
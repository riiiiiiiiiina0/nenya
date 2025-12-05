/* global chrome */

const getdarkModeRules = async () => {
  const { darkModeRules } = await chrome.storage.local.get('darkModeRules');
  return darkModeRules || [];
};

const savedarkModeRules = async (rules, skipSync = false) => {
  if (!skipSync) {
    syncing = true;
  }
  await chrome.storage.local.set({ darkModeRules: rules });
  if (!skipSync) {
    syncing = false;
  }
};

let syncing = false;

const renderRules = async () => {
  const rules = await getdarkModeRules();
  const rulesList = document.getElementById('darkModeRulesList');
  const rulesEmpty = document.getElementById('darkModeRulesEmpty');

  if (rules.length === 0) {
    rulesList.innerHTML = '';
    rulesEmpty.hidden = false;
    return;
  }

  rulesEmpty.hidden = true;
  rulesList.textContent = '';

  rules.forEach((rule) => {
    const container = document.createElement('article');
    container.className =
      'rounded-lg border border-base-300 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between';
    container.setAttribute('role', 'listitem');

    if (!rule.enabled) {
      container.classList.add('opacity-50');
    }

    const info = document.createElement('div');
    info.className = 'space-y-1';

    const pattern = document.createElement('p');
    pattern.className = 'font-mono text-sm break-words';
    pattern.textContent = rule.pattern;
    info.appendChild(pattern);

    container.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline';
    editButton.textContent = 'Edit';
    editButton.dataset.id = rule.id;
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm btn-error btn-outline';
    deleteButton.textContent = 'Delete';
    deleteButton.dataset.id = rule.id;
    actions.appendChild(deleteButton);

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'flex items-center gap-2';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-success';
    toggle.checked = rule.enabled;
    toggle.dataset.id = rule.id;
    toggle.title = 'Enabled';
    toggleContainer.appendChild(toggle);
    actions.appendChild(toggleContainer);

    container.appendChild(actions);
    rulesList.appendChild(container);
  });
};

  const initUrlPreload = () => {
    const hash = window.location.hash;
    const urlMatch = hash.match(/&url=([^&]*)/);
    if (urlMatch && urlMatch[1]) {
      const url = decodeURIComponent(urlMatch[1]);
      document.getElementById('darkModePatternInput').value = url;
    }
  }

  const initDarkMode = () => {
    const darkModeForm = document.getElementById('darkModeRuleForm');
    const darkModePatternInput = document.getElementById('darkModePatternInput');
    const darkModeSaveButton = document.getElementById('darkModeSaveButton');
    const darkModeCancelEditButton = document.getElementById('darkModeCancelEditButton');
    const darkModeRulesList = document.getElementById('darkModeRulesList');

    let editingRuleId = null;

    darkModeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pattern = darkModePatternInput.value.trim();
      if (!pattern) return;

      let rules = await getdarkModeRules();
      if (editingRuleId) {
        rules = rules.map(rule => rule.id === editingRuleId ? { ...rule, pattern } : rule);
      } else {
        rules.push({ id: Date.now().toString(), pattern, enabled: true });
      }
      await savedarkModeRules(rules);
      await renderRules();
      darkModeForm.reset();
      editingRuleId = null;
      darkModeSaveButton.textContent = 'Add Rule';
      darkModeCancelEditButton.hidden = true;
    });

    darkModeCancelEditButton.addEventListener('click', () => {
      darkModeForm.reset();
      editingRuleId = null;
      darkModeSaveButton.textContent = 'Add Rule';
      darkModeCancelEditButton.hidden = true;
    });

    darkModeRulesList.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const id = target.dataset.id;
      if (!id) return;

      if (target.matches('.toggle')) {
        let rules = await getdarkModeRules();
        rules = rules.map(rule => rule.id === id ? { ...rule, enabled: /** @type {HTMLInputElement} */ (target).checked } : rule);
        await savedarkModeRules(rules);
        await renderRules();
      } else if (target.textContent === 'Edit') {
        const rules = await getdarkModeRules();
        const rule = rules.find(rule => rule.id === id);
        if (rule) {
          darkModePatternInput.value = rule.pattern;
          editingRuleId = id;
          darkModeSaveButton.textContent = 'Save changes';
          darkModeCancelEditButton.hidden = false;
        }
      } else if (target.textContent === 'Delete') {
        // eslint-disable-next-line no-alert
        const confirmed = window.confirm('Delete the dark mode rule for "' + (await getdarkModeRules()).find(r => r.id === id)?.pattern + '"?');
        if (!confirmed) return;
        let rules = await getdarkModeRules();
        rules = rules.filter(rule => rule.id !== id);
        await savedarkModeRules(rules);
        await renderRules();
      }
    });

    // Listen for storage changes to update UI when options are restored from backup
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') {
        return;
      }
      if (syncing) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(changes, 'darkModeRules')) {
        renderRules();
      }
    });

    initUrlPreload();
    renderRules();
  }

  document.addEventListener('DOMContentLoaded', initDarkMode);


const getdarkModeRules = async () => {
    const { darkModeRules } = await chrome.storage.sync.get('darkModeRules');
    return darkModeRules || [];
  };

  const savedarkModeRules = async (rules) => {
    await chrome.storage.sync.set({ darkModeRules: rules });
  };

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
    rulesList.innerHTML = rules.map(rule => `
      <div class="flex items-center justify-between p-2 rounded-lg hover:bg-base-200">
        <div class="flex items-center gap-2">
          <input type="checkbox" class="toggle toggle-sm" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
          <span class="text-sm">${rule.pattern}</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-xs btn-outline" data-id="${rule.id}">Edit</button>
          <button class="btn btn-xs btn-error" data-id="${rule.id}">Delete</button>
        </div>
      </div>
    `).join('');
  };

  const initUrlPreload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const url = urlParams.get('url');
    if (url) {
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
      darkModeSaveButton.textContent = '➕';
      darkModeCancelEditButton.hidden = true;
    });

    darkModeCancelEditButton.addEventListener('click', () => {
        darkModeForm.reset();
        editingRuleId = null;
        darkModeSaveButton.textContent = '➕';
        darkModeCancelEditButton.hidden = true;
    });

    darkModeRulesList.addEventListener('click', async (e) => {
      const { id } = e.target.dataset;
      if (!id) return;

      if (e.target.matches('.toggle')) {
        let rules = await getdarkModeRules();
        rules = rules.map(rule => rule.id === id ? { ...rule, enabled: e.target.checked } : rule);
        await savedarkModeRules(rules);
      } else if (e.target.textContent === 'Edit') {
        const rules = await getdarkModeRules();
        const rule = rules.find(rule => rule.id === id);
        if (rule) {
          darkModePatternInput.value = rule.pattern;
          editingRuleId = id;
          darkModeSaveButton.textContent = '💾';
          darkModeCancelEditButton.hidden = false;
        }
      } else if (e.target.textContent === 'Delete') {
        let rules = await getdarkModeRules();
        rules = rules.filter(rule => rule.id !== id);
        await savedarkModeRules(rules);
        await renderRules();
      }
    });

    initUrlPreload();
    renderRules();
  }

  document.addEventListener('DOMContentLoaded', initDarkMode);

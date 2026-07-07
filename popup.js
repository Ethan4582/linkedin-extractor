// Store extracted data
let extractedData = [];
let currentTabUrl = '';
let savedCompanyName = '';
let currentSearchQuery = '';
let editIndex = -1;

const ICONS = {
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  cancel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
};

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const clearBtn = document.getElementById('clearBtn');
  const editCompanyBtn = document.getElementById('editCompanyBtn');
  const companyNameInput = document.getElementById('companyName');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const searchInput = document.getElementById('searchInput');
  const filterBtn = document.getElementById('filterBtn');

  loadSavedData();
  checkCurrentTab();

  startBtn.addEventListener('click', startExtraction);
  downloadCsvBtn.addEventListener('click', downloadCsv);
  downloadExcelBtn.addEventListener('click', downloadExcel);
  clearBtn.addEventListener('click', clearResults);
  editCompanyBtn.addEventListener('click', editCompanyName);

  searchToggleBtn.addEventListener('click', () => {
    const searchBar = document.getElementById('searchBar');
    searchBar.classList.toggle('hidden');
    searchToggleBtn.classList.toggle('active');
    if (!searchBar.classList.contains('hidden')) {
      searchInput.focus();
    }
  });

  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim().toLowerCase();
    filterAndRender();
  });

  filterBtn.addEventListener('click', cycleFilterSort);
});

let currentSort = 'default';

function cycleFilterSort() {
  const sorts = ['default', 'name-asc', 'company-asc'];
  const idx = sorts.indexOf(currentSort);
  currentSort = sorts[(idx + 1) % sorts.length];
  const labels = {
    default: 'Default order',
    'name-asc': 'Sorted by name',
    'company-asc': 'Sorted by company'
  };
  showStatus(labels[currentSort], 'info');
  filterAndRender();
}

function filterAndRender() {
  let data = [...extractedData];

  if (currentSearchQuery) {
    data = data.filter(p =>
      p.name.toLowerCase().includes(currentSearchQuery) ||
      p.company.toLowerCase().includes(currentSearchQuery)
    );
  }

  if (currentSort === 'name-asc') {
    data.sort((a, b) => a.name.localeCompare(b.name));
  } else if (currentSort === 'company-asc') {
    data.sort((a, b) => a.company.localeCompare(b.company));
  }

  displayResults(data);
}

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url;

    if (!tab.url.includes('linkedin.com/in/')) {
      showStatus('Not on a LinkedIn profile page. Navigate to a profile first.', 'error');
      document.getElementById('startBtn').disabled = true;
      return;
    }

    document.getElementById('startBtn').disabled = false;

    if (isOverlayUrl(tab.url)) {
      showStatus('Ready! You are on the recommendations overlay. Enter company name and click Start.', 'success');
    } else {
      const username = extractUsername(tab.url);
      showStatus(`Found profile: ${username}. Will navigate to recommendations overlay.`, 'success');
    }
  } catch (error) {
    showStatus('Error checking tab: ' + error.message, 'error');
  }
}

function isOverlayUrl(url) {
  return url.includes('/overlay/browsemap-recommendations');
}

function showStatus(message, type = 'info') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status show ${type}`;
}

function hideStatus() {
  document.getElementById('status').className = 'status';
}

function editCompanyName() {
  const companyNameInput = document.getElementById('companyName');
  const editBtn = document.getElementById('editCompanyBtn');
  const savedCompanyDisplay = document.getElementById('savedCompanyDisplay');

  if (savedCompanyName) {
    companyNameInput.value = savedCompanyName;
  }
  companyNameInput.disabled = false;
  companyNameInput.classList.remove('hidden');
  savedCompanyDisplay.classList.add('hidden');
  editBtn.classList.add('hidden');
  companyNameInput.focus();

  savedCompanyName = '';
  saveCompanyName();
}

function lockCompanyName(companyName) {
  const companyNameInput = document.getElementById('companyName');
  const editBtn = document.getElementById('editCompanyBtn');
  const savedCompanyDisplay = document.getElementById('savedCompanyDisplay');

  savedCompanyName = companyName;
  saveCompanyName();

  companyNameInput.value = companyName;
  companyNameInput.disabled = true;
  companyNameInput.classList.add('hidden');
  savedCompanyDisplay.textContent = companyName;
  savedCompanyDisplay.classList.remove('hidden');
  editBtn.classList.remove('hidden');
}

async function startExtraction() {
  let companyName = document.getElementById('companyName').value.trim();

  if (!companyName && savedCompanyName) {
    companyName = savedCompanyName;
  }

  if (!companyName) {
    showStatus('Please enter a company name', 'error');
    return;
  }

  if (!savedCompanyName) {
    lockCompanyName(companyName);
  }

  showStatus('Getting current tab...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url;

    if (!tab.url.includes('linkedin.com/in/')) {
      showStatus('Please navigate to a LinkedIn profile page first', 'error');
      return;
    }

    if (isOverlayUrl(tab.url)) {
      showStatus('Already on recommendations overlay. Extracting data...', 'info');
      await extractDataFromCurrentPage(tab.id, companyName);
    } else {
      const username = extractUsername(tab.url);
      if (!username) {
        showStatus('Could not extract username from URL', 'error');
        return;
      }
      showStatus(`Navigating to recommendations overlay for ${username}...`, 'info');
      const overlayUrl = `https://www.linkedin.com/in/${username}/overlay/browsemap-recommendations/`;
      await chrome.tabs.update(tab.id, { url: overlayUrl });
      showStatus('Waiting for page to load (5 seconds)...', 'info');
      setTimeout(async () => {
        await extractDataFromCurrentPage(tab.id, companyName);
      }, 5000);
    }
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
    console.error(error);
  }
}

async function extractDataFromCurrentPage(tabId, companyName) {
  try {
    showStatus('Extracting profiles...', 'info');

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: extractProfileData,
      args: [companyName]
    });

    console.log('Extraction results:', results);

    if (results && results[0] && results[0].result) {
      const response = results[0].result;

      if (response.debug) {
        console.log('Debug info:', response.debug);
      }

      const profiles = response.profiles || [];

      if (profiles.length > 0) {
        const existingNames = new Set(extractedData.map(p => p.name.toLowerCase()));
        const newProfiles = profiles.filter(p => !existingNames.has(p.name.toLowerCase()));

        extractedData = [...extractedData, ...newProfiles];
        saveData();
        filterAndRender();

        const skipped = profiles.length - newProfiles.length;
        if (skipped > 0) {
          showStatus(`Found ${newProfiles.length} new profiles! (${skipped} duplicates skipped)`, 'success');
        } else {
          showStatus(`Found ${newProfiles.length} matching profiles!`, 'success');
        }
      } else {
        showStatus('No matching profiles found. Try a different company name or check the spelling.', 'info');
      }
    } else {
      showStatus('No data returned. Try scrolling down the overlay first and click Start again.', 'error');
    }
  } catch (err) {
    showStatus('Error: ' + err.message + '. Make sure the overlay is fully loaded.', 'error');
    console.error('Extraction error:', err);
  }
}

function extractUsername(url) {
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/);
  return match ? match[1] : null;
}

function generateCompanyVariants(companyName) {
  const variants = new Set();
  const original = companyName.trim();

  variants.add(original);
  variants.add(original.toLowerCase());

  const noPunctuation = original.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
  variants.add(noPunctuation);
  variants.add(noPunctuation.toLowerCase());

  const noSpaces = original.replace(/\s+/g, '');
  variants.add(noSpaces);
  variants.add(noSpaces.toLowerCase());

  const dotToSpace = original.replace(/\./g, ' ');
  variants.add(dotToSpace);
  variants.add(dotToSpace.toLowerCase());

  const spaceToDot = original.replace(/\s+/g, '.');
  variants.add(spaceToDot);
  variants.add(spaceToDot.toLowerCase());

  const spaceToDash = original.replace(/\s+/g, '-');
  variants.add(spaceToDash);
  variants.add(spaceToDash.toLowerCase());

  const dashToSpace = original.replace(/-/g, ' ');
  variants.add(dashToSpace);
  variants.add(dashToSpace.toLowerCase());

  const underscoreToSpace = original.replace(/_/g, ' ');
  variants.add(underscoreToSpace);
  variants.add(underscoreToSpace.toLowerCase());

  const noSeparators = original.replace(/[\s.\-_]+/g, '');
  variants.add(noSeparators);
  variants.add(noSeparators.toLowerCase());

  const cleanest = original.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\s]/g, '');
  variants.add(cleanest);
  variants.add(cleanest.toLowerCase());

  return Array.from(variants).filter(v => v.length > 0);
}

function extractProfileData(companyName) {
  const profiles = [];
  const seenUrls = new Set();
  let debugInfo = [];

  function generateCompanyVariants(name) {
    const variants = new Set();
    const original = name.trim();
    variants.add(original.toLowerCase());
    variants.add(original.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').toLowerCase());
    variants.add(original.replace(/\s+/g, '').toLowerCase());
    return Array.from(variants).filter(v => v.length > 0);
  }

  function normalizeText(text) {
    return text
      .replace(/Â/g, '')
      .replace(/[·•]/g, ' ')
      .replace(/[\u00A0\u2000-\u200F\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();
  }

  function extractName(text) {
    let cleaned = text
      .replace(/Â/g, '')
      .replace(/[\u00A0\u2000-\u200F\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let parts = cleaned.split(/[·•]/);
    let name = (parts[0] || '').trim();
    name = name.replace(/(Connect|Follow|Message)$/i, '').trim();
    name = name.replace(/\d+(st|nd|rd|th)$/i, '').trim();

    const len = name.length;
    if (len % 2 === 0 && len > 0) {
      const mid = len / 2;
      if (name.substring(0, mid) === name.substring(mid)) {
        name = name.substring(0, mid).trim();
      }
    }

    const words = name.split(' ');
    const half = Math.floor(words.length / 2);
    if (words.length % 2 === 0 && words.length > 2) {
      const firstHalf = words.slice(0, half).join(' ');
      const secondHalf = words.slice(half).join(' ');
      if (firstHalf === secondHalf) {
        name = firstHalf;
      }
    }

    return name;
  }

  function matchesCompany(text, variants) {
    const normalized = normalizeText(text);
    for (const variant of variants) {
      if (normalized.includes(variant)) return true;
    }
    return false;
  }

  const companyVariants = generateCompanyVariants(companyName);
  debugInfo.push(`Company variants: ${companyVariants.slice(0, 3).join(', ')}...`);

  const allProfileLinks = document.querySelectorAll('a[href*="/in/"]');
  debugInfo.push(`Found ${allProfileLinks.length} profile links on page`);

  let processedNames = [];

  allProfileLinks.forEach((aTag) => {
    const href = aTag.href || aTag.getAttribute('href');
    if (!href || !href.includes('/in/') || href.includes('/in/edit') || href.includes('/in/settings')) return;

    let profileUrl = href;
    if (!profileUrl.startsWith('http')) profileUrl = 'https://www.linkedin.com' + href;
    profileUrl = profileUrl.split('?')[0];
    if (seenUrls.has(profileUrl)) return;

    const rawText = aTag.textContent || '';
    const name = extractName(rawText);

    if (!name || name.length < 2 || name.length > 60) return;
    if (/^(connect|message|follow|view|more|see all|show|hide|settings|chapters|captions|off|on|\d+)$/i.test(name)) return;

    if (!matchesCompany(rawText, companyVariants)) {
      processedNames.push(`${name} | NO MATCH`);
      return;
    }

    processedNames.push(`${name} | MATCH`);
    profiles.push({ name, company: companyName, profileUrl });
    seenUrls.add(profileUrl);
  });

  debugInfo.push(`Processed ${processedNames.length} valid profiles`);
  debugInfo.push('Results: ' + processedNames.slice(0, 15).join(' | '));
  if (processedNames.length > 15) debugInfo.push(`... and ${processedNames.length - 15} more`);

  return { profiles, totalCards: allProfileLinks.length, debug: debugInfo.join(' | ') };
}

function displayResults(data = extractedData) {
  const resultsDiv = document.getElementById('results');
  const tbody = document.querySelector('#resultsTable tbody');
  const profileCount = document.getElementById('profileCount');

  tbody.innerHTML = '';
  profileCount.textContent = extractedData.length;

  if (data.length === 0 && extractedData.length > 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="4" class="no-results">No profiles match your search</td>`;
    tbody.appendChild(row);
    resultsDiv.classList.remove('hidden');
    return;
  }

  data.forEach((profile, displayIdx) => {
    const originalIndex = extractedData.indexOf(profile);
    const row = document.createElement('tr');
    row.dataset.index = originalIndex;

    if (editIndex === originalIndex) {
      row.innerHTML = `
        <td>${displayIdx + 1}</td>
        <td><input type="text" class="cell-input" id="edit-name-${originalIndex}" value="${escapeHtml(profile.name)}"></td>
        <td><input type="text" class="cell-input" id="edit-company-${originalIndex}" value="${escapeHtml(profile.company)}"></td>
        <td>
          <div class="action-group">
            <div class="action-well">
              <button class="action-btn save" title="Save" data-action="save" data-index="${originalIndex}">${ICONS.save}</button>
            </div>
            <div class="action-well">
              <button class="action-btn cancel" title="Cancel" data-action="cancel" data-index="${originalIndex}">${ICONS.cancel}</button>
            </div>
          </div>
        </td>
      `;
    } else {
      row.innerHTML = `
        <td>${displayIdx + 1}</td>
        <td><a href="${escapeHtml(profile.profileUrl)}" target="_blank" rel="noopener noreferrer" class="profile-link cell-text" title="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</a></td>
        <td><div class="cell-text" title="${escapeHtml(profile.company)}">${escapeHtml(profile.company)}</div></td>
        <td>
          <div class="action-group">
            <div class="action-well">
              <button class="action-btn edit" title="Edit" data-action="edit" data-index="${originalIndex}">${ICONS.edit}</button>
            </div>
            <div class="action-well">
              <button class="action-btn delete" title="Delete" data-action="delete" data-index="${originalIndex}">${ICONS.delete}</button>
            </div>
          </div>
        </td>
      `;
    }

    tbody.appendChild(row);
  });

  tbody.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', handleActionClick);
  });

  tbody.querySelectorAll('.cell-input').forEach(input => {
    input.addEventListener('keydown', handleEditKeydown);
  });

  resultsDiv.classList.remove('hidden');
  document.getElementById('downloadCsvBtn').disabled = false;
  document.getElementById('downloadExcelBtn').disabled = false;
}

function handleActionClick(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const index = parseInt(btn.dataset.index, 10);

  if (action === 'edit') startEditingRow(index);
  else if (action === 'delete') deleteRow(index);
  else if (action === 'save') saveEditingRow(index);
  else if (action === 'cancel') cancelEditingRow();
}

function handleEditKeydown(e) {
  if (e.key === 'Enter') {
    const index = parseInt(e.target.id.split('-').pop(), 10);
    saveEditingRow(index);
  } else if (e.key === 'Escape') {
    cancelEditingRow();
  }
}

function startEditingRow(index) {
  editIndex = index;
  filterAndRender();
  const input = document.getElementById(`edit-name-${index}`);
  if (input) input.focus();
}

function saveEditingRow(index) {
  const nameInput = document.getElementById(`edit-name-${index}`);
  const companyInput = document.getElementById(`edit-company-${index}`);

  if (!nameInput || !companyInput) return;

  const newName = nameInput.value.trim();
  if (!newName) {
    showStatus('Name cannot be empty', 'error');
    return;
  }

  extractedData[index].name = newName;
  extractedData[index].company = companyInput.value.trim();
  editIndex = -1;
  saveData();
  filterAndRender();
  showStatus('Profile updated', 'success');
}

function cancelEditingRow() {
  editIndex = -1;
  filterAndRender();
}

function deleteRow(index) {
  const name = extractedData[index].name;
  extractedData.splice(index, 1);
  saveData();

  if (editIndex === index) editIndex = -1;
  else if (editIndex > index) editIndex -= 1;

  filterAndRender();
  showStatus(`Deleted ${name}`, 'success');

  if (extractedData.length === 0) {
    document.getElementById('results').classList.add('hidden');
    document.getElementById('downloadCsvBtn').disabled = true;
    document.getElementById('downloadExcelBtn').disabled = true;
    hideStatus();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function downloadCsv() {
  if (extractedData.length === 0) {
    showStatus('No data to download', 'error');
    return;
  }

  const headers = ['#', 'Name', 'Company', 'Profile URL'];
  const rows = extractedData.map((profile, index) => [
    index + 1,
    `"${profile.name.replace(/"/g, '""')}"`,
    `"${profile.company.replace(/"/g, '""')}"`,
    profile.profileUrl
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `linkedin_profiles_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showStatus('CSV file downloaded successfully!', 'success');
}

function downloadExcel() {
  if (extractedData.length === 0) {
    showStatus('No data to download', 'error');
    return;
  }

  const excelData = extractedData.map((profile, index) => ({
    '#': index + 1,
    'Name': profile.name,
    'Company': profile.company,
    'Profile URL': profile.profileUrl
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelData);

  ws['!cols'] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 25 },
    { wch: 70 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'LinkedIn Profiles');

  const fileName = `linkedin_profiles_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);

  showStatus('Excel file downloaded successfully!', 'success');
}

function clearResults() {
  extractedData = [];
  savedCompanyName = '';
  currentSearchQuery = '';
  editIndex = -1;
  currentSort = 'default';
  saveData();
  saveCompanyName();

  document.querySelector('#resultsTable tbody').innerHTML = '';
  document.getElementById('results').classList.add('hidden');
  document.getElementById('profileCount').textContent = '0';
  document.getElementById('downloadCsvBtn').disabled = true;
  document.getElementById('downloadExcelBtn').disabled = true;
  document.getElementById('searchBar').classList.add('hidden');
  document.getElementById('searchToggleBtn').classList.remove('active');
  document.getElementById('searchInput').value = '';

  const companyNameInput = document.getElementById('companyName');
  const editBtn = document.getElementById('editCompanyBtn');
  const savedCompanyDisplay = document.getElementById('savedCompanyDisplay');

  companyNameInput.disabled = false;
  companyNameInput.value = '';
  companyNameInput.classList.remove('hidden');
  editBtn.classList.add('hidden');
  savedCompanyDisplay.classList.add('hidden');
  savedCompanyDisplay.textContent = 'Not set';

  hideStatus();
  checkCurrentTab();
}

function saveData() {
  chrome.storage.session.set({ extractedProfiles: extractedData });
}

function saveCompanyName() {
  chrome.storage.session.set({ savedCompanyName: savedCompanyName });
}

function loadSavedData() {
  chrome.storage.session.get(['extractedProfiles', 'savedCompanyName'], (result) => {
    if (result.extractedProfiles && result.extractedProfiles.length > 0) {
      extractedData = result.extractedProfiles;
      filterAndRender();
    }

    if (result.savedCompanyName) {
      savedCompanyName = result.savedCompanyName;
      lockCompanyName(savedCompanyName);
    }
  });
}

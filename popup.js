// Store extracted data
let extractedData = [];
let currentTabUrl = '';
let excelUrl = '';
let savedCompanyName = '';

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const updateExcelBtn = document.getElementById('updateExcelBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const clearBtn = document.getElementById('clearBtn');
  const excelUrlInput = document.getElementById('excelUrl');
  const editCompanyBtn = document.getElementById('editCompanyBtn');
  const companyNameInput = document.getElementById('companyName');
  
 
  loadSavedData();
  
 
  checkCurrentTab();
  
  startBtn.addEventListener('click', startExtraction);
  updateExcelBtn.addEventListener('click', updateExcel);
  downloadCsvBtn.addEventListener('click', downloadCsv);
  downloadExcelBtn.addEventListener('click', downloadExcel);
  clearBtn.addEventListener('click', clearResults);
  editCompanyBtn.addEventListener('click', editCompanyName);
  

  excelUrlInput.addEventListener('input', (e) => {
    excelUrl = e.target.value.trim();
    saveExcelUrl();
  });
});


async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url;
    
    if (!tab.url.includes('linkedin.com/in/')) {
      showStatus('⚠️ Not on a LinkedIn profile page. Navigate to a profile first.', 'error');
      document.getElementById('startBtn').disabled = true;
      return;
    }
    
    document.getElementById('startBtn').disabled = false;
    
    if (isOverlayUrl(tab.url)) {
      showStatus('✓ Ready! You are on the recommendations overlay. Enter company name and click Start.', 'success');
    } else {
      const username = extractUsername(tab.url);
      showStatus(`✓ Found profile: ${username}. Will navigate to recommendations overlay.`, 'info');
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
  
  companyNameInput.disabled = false;
  companyNameInput.focus();
  editBtn.style.display = 'none';
  savedCompanyDisplay.style.display = 'none';
  companyNameInput.parentElement.style.display = 'block';
  
  savedCompanyName = '';
  saveCompanyName();
}

function lockCompanyName(companyName) {
  const companyNameInput = document.getElementById('companyName');
  const editBtn = document.getElementById('editCompanyBtn');
  const savedCompanyDisplay = document.getElementById('savedCompanyDisplay');
  
  savedCompanyName = companyName;
  saveCompanyName();
  
  companyNameInput.disabled = true;
  companyNameInput.value = companyName;
  savedCompanyDisplay.textContent = `Using: ${companyName}`;
  savedCompanyDisplay.style.display = 'block';
  editBtn.style.display = 'inline-block';
  companyNameInput.parentElement.style.display = 'none';
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
        displayResults();
        
        const skipped = profiles.length - newProfiles.length;
        if (skipped > 0) {
          showStatus(`Found ${newProfiles.length} new profiles! (${skipped} duplicates skipped)`, 'success');
        } else {
          showStatus(`Found ${newProfiles.length} matching profiles!`, 'success');
        }
      } else {
      
        const debugMsg = response.debug || 'No debug info';
        showStatus(`No profiles matching "${companyName}". Found ${response.totalCards || 0} cards. ${debugMsg}`, 'info');
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
    variants.add(original);
    variants.add(original.toLowerCase());
    variants.add(original.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ''));
    variants.add(original.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').toLowerCase());
    variants.add(original.replace(/\s+/g, ''));
    variants.add(original.replace(/\s+/g, '').toLowerCase());
    return Array.from(variants).filter(v => v.length > 0);
  }

  const companyVariants = generateCompanyVariants(companyName);
  debugInfo.push(`Company variants: ${companyVariants.slice(0, 5).join(', ')}...`);

  function matchesCompany(text) {
    if (!text) return false;
    const textLower = text.toLowerCase();
    const textClean = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\s]/g, '').toLowerCase();
    
    for (const variant of companyVariants) {
      const variantLower = variant.toLowerCase();
      if (textLower.includes(variantLower) || textClean.includes(variantLower.replace(/[\s.\-_]/g, ''))) {
        return true;
      }
    }
    return false;
  }

  function cleanName(name) {
    if (!name) return '';
    
    name = name.replace(/[•·]\s*(1st|2nd|3rd|\d+th)/gi, '');
    name = name.replace(/view\s+profile/gi, '');
    name = name.replace(/\bMessage\b/gi, '');
    name = name.replace(/\bConnect\b/gi, '');
    name = name.replace(/\bFollow\b/gi, '');
    name = name.replace(/\bPending\b/gi, '');
    name = name.replace(/\s+/g, ' ').trim();
    
    // Remove duplicated names
    const words = name.split(/\s+/);
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2;
      const firstHalf = words.slice(0, half).join(' ');
      const secondHalf = words.slice(half).join(' ');
      if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
        return firstHalf;
      }
    }
    
    return name;
  }

  let profileCards = [];

  // Extended list of container selectors for LinkedIn's various modal/overlay structures
  const containerSelectors = [
    '.artdeco-modal__content',
    '[role="dialog"]',
    '.scaffold-finite-scroll__content',
    '.browsemap-recommendations',
    '[data-test-modal]',
    '.pv-browsemap-section',
    '.scaffold-layout__main',
    'main',
    '#main'
  ];
  
  let container = null;
  for (const selector of containerSelectors) {
    container = document.querySelector(selector);
    if (container) {
      debugInfo.push(`Found container: ${selector}`);
      break;
    }
  }

  // Extended list of profile card selectors
  const cardSelectors = [
    // LinkedIn specific selectors
    'li.artdeco-list__item',
    'li[class*="artdeco-list"]',
    '.entity-result__item',
    '.entity-result',
    'li.reusable-search__result-container',
    '.pvs-list__item--line-separated',
    '.pv-browsemap-section__member-container',
    // Generic list items with links
    'li:has(a[href*="/in/"])',
    'div[data-view-name="profile-card"]',
    '[data-chameleon-result-urn]',
    // Fallback to any li with profile links
    'ul li'
  ];
  
  // Try to find cards in container first, then fallback to document
  for (const selector of cardSelectors) {
    try {
      const elements = container 
        ? container.querySelectorAll(selector)
        : document.querySelectorAll(selector);
      
      if (elements.length > 0) {
        // Filter to only include elements that have a profile link
        const filtered = Array.from(elements).filter(el => 
          el.querySelector('a[href*="/in/"]') || el.closest('a[href*="/in/"]')
        );
        
        if (filtered.length > 0) {
          profileCards = filtered;
          debugInfo.push(`Found ${filtered.length} cards with: ${selector}`);
          break;
        }
      }
    } catch (e) {
      // :has() selector might not be supported in older browsers
      debugInfo.push(`Selector error: ${selector}`);
    }
  }

  // Fallback: Find all elements with profile links
  if (profileCards.length === 0) {
    const allProfileLinks = document.querySelectorAll('a[href*="/in/"]');
    debugInfo.push(`Found ${allProfileLinks.length} profile links on page`);
    
    const processedParents = new Set();
    allProfileLinks.forEach(link => {
      // Get the parent container (li, div, etc.)
      let parent = link.closest('li') || link.closest('div[class*="entity"]') || link.parentElement?.parentElement;
      if (parent && !processedParents.has(parent)) {
        processedParents.add(parent);
        profileCards.push(parent);
      }
    });
    debugInfo.push(`Fallback: Found ${profileCards.length} unique parent containers`);
  }

  debugInfo.push(`Total cards to process: ${profileCards.length}`);

  profileCards.forEach((card, index) => {
    const text = card.textContent || '';
    
    // Check if card matches company (or process all if no specific filter needed for testing)
    const cardMatchesCompany = matchesCompany(text);
    
    if (cardMatchesCompany) {
      let name = '';
      
      // Method 1: Find name from profile link
      const profileLink = card.querySelector('a[href*="/in/"]');
      if (profileLink) {
        // Try aria-label first (often contains the full name)
        const ariaLabel = profileLink.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.length > 1 && ariaLabel.length < 60) {
          name = ariaLabel.replace(/^View\s+/i, '').replace(/['']s\s+profile$/i, '').trim();
        }
        
        // Try span inside the link
        if (!name) {
          const spans = profileLink.querySelectorAll('span');
          for (const span of spans) {
            const spanText = span.textContent.trim();
            if (spanText.length > 1 && spanText.length < 50 && 
                !spanText.toLowerCase().includes('degree') &&
                !spanText.match(/^\d/)) {
              name = spanText;
              break;
            }
          }
        }
      }
      
      // Method 2: Find aria-hidden spans (LinkedIn often puts names here)
      if (!name) {
        const ariaHiddenSpans = card.querySelectorAll('span[aria-hidden="true"]');
        for (const span of ariaHiddenSpans) {
          const spanText = span.textContent.trim();
          if (spanText.length > 1 && 
              spanText.length < 50 && 
              !matchesCompany(spanText) &&
              !spanText.includes('•') &&
              !spanText.match(/^\d/) &&
              !spanText.toLowerCase().includes('connect') &&
              !spanText.toLowerCase().includes('message') &&
              !spanText.toLowerCase().includes('follow')) {
            name = spanText;
            break;
          }
        }
      }

      // Method 3: Look for specific name container classes
      if (!name) {
        const nameSelectors = [
          '.entity-result__title-text',
          '.actor-name',
          '[data-anonymize="person-name"]',
          '.artdeco-entity-lockup__title'
        ];
        for (const sel of nameSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            name = el.textContent.trim();
            break;
          }
        }
      }
      
      name = cleanName(name);
      
      if (name && name.length > 1 && name.length < 50 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in/ "${name}" "${companyName}"`)}`;
        
        profiles.push({
          name: name,
          company: companyName,
          searchUrl: searchUrl
        });
      }
    }

    processedNames.push(`${name} | ${companyMatch ? 'MATCH' : 'NO MATCH'}`);

    if (companyMatch) {
      profiles.push({
        name,
        company: companyName,
        profileUrl
      });
      seenUrls.add(profileUrl);
    }
  });

  return {
    profiles: profiles,
    totalCards: allProfileLinks.length,
    debug: debugInfo.join(' | ')
  };
}

function displayResults() {
  const resultsDiv = document.getElementById('results');
  const tbody = document.querySelector('#resultsTable tbody');
  const profileCount = document.getElementById('profileCount');

  tbody.innerHTML = '';
  profileCount.textContent = extractedData.length;

  extractedData.forEach((profile, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td title="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</td>
      <td title="${escapeHtml(profile.company)}">${escapeHtml(profile.company)}</td>
      <td><a href="${profile.profileUrl}" target="_blank" class="search-link">Profile</a></td>
    `;
    tbody.appendChild(row);
  });

  resultsDiv.classList.remove('hidden');
  document.getElementById('downloadCsvBtn').disabled = false;
  document.getElementById('downloadExcelBtn').disabled = false;
  if (excelUrl) {
    document.getElementById('updateExcelBtn').disabled = false;
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

// Update Excel file directly via URL
async function updateExcel() {
  const url = document.getElementById('excelUrl').value.trim();
  
  if (!url) {
    showStatus('Please enter Excel file URL', 'error');
    return;
  }
  
  if (extractedData.length === 0) {
    showStatus('No data to update', 'error');
    return;
  }
  
  showStatus('⚠️ Direct Excel update requires API integration. Downloading file instead...', 'info');
  

  setTimeout(() => {
    downloadExcel();
  }, 1000);
}

function clearResults() {
  extractedData = [];
  savedCompanyName = '';
  saveData();
  saveCompanyName();
  
  document.querySelector('#resultsTable tbody').innerHTML = '';
  document.getElementById('results').classList.add('hidden');
  document.getElementById('profileCount').textContent = '0';
  document.getElementById('downloadCsvBtn').disabled = true;
  document.getElementById('downloadExcelBtn').disabled = true;
  document.getElementById('updateExcelBtn').disabled = true;
  
 
  const companyNameInput = document.getElementById('companyName');
  const editBtn = document.getElementById('editCompanyBtn');
  const savedCompanyDisplay = document.getElementById('savedCompanyDisplay');
  
  companyNameInput.disabled = false;
  companyNameInput.value = '';
  editBtn.style.display = 'none';
  savedCompanyDisplay.style.display = 'none';
  companyNameInput.parentElement.style.display = 'block';
  
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
      displayResults();
    }
    
    if (result.savedCompanyName) {
      savedCompanyName = result.savedCompanyName;
      lockCompanyName(savedCompanyName);
    }
  });
  

  chrome.storage.local.get(['excelUrl'], (result) => {
    if (result.excelUrl) {
      excelUrl = result.excelUrl;
      document.getElementById('excelUrl').value = excelUrl;
    }
  });
}

function saveExcelUrl() {
  chrome.storage.local.set({ excelUrl: excelUrl });
}
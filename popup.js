// Store extracted data
let extractedData = [];
let loadedExcelData = [];
let loadedFileName = '';
let currentTabUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const appendToExcelBtn = document.getElementById('appendToExcelBtn');
  const clearBtn = document.getElementById('clearBtn');
  const excelFileInput = document.getElementById('excelFileInput');
  
  // Load saved data
  loadSavedData();
  
  // Check current tab URL on popup open
  checkCurrentTab();
  
  startBtn.addEventListener('click', startExtraction);
  downloadExcelBtn.addEventListener('click', downloadExcel);
  appendToExcelBtn.addEventListener('click', appendToExcel);
  clearBtn.addEventListener('click', clearResults);
  excelFileInput.addEventListener('change', handleExcelUpload);
});

// Check current tab URL every time popup opens
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
    
    // Check if already on overlay page
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

// Check if URL is already the overlay format
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

async function startExtraction() {
  const companyName = document.getElementById('companyName').value.trim();
  
  if (!companyName) {
    showStatus('Please enter a company name', 'error');
    return;
  }
  
  showStatus('Getting current tab...', 'info');
  
  try {
    // Get the active tab - FRESH check every time
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url;
    
    // Check if we're on a LinkedIn profile page
    if (!tab.url.includes('linkedin.com/in/')) {
      showStatus('Please navigate to a LinkedIn profile page first', 'error');
      return;
    }
    
    // Check if already on overlay URL - no need to navigate
    if (isOverlayUrl(tab.url)) {
      showStatus('Already on recommendations overlay. Extracting data...', 'info');
      await extractDataFromCurrentPage(tab.id, companyName);
    } else {
      // BACKUP: Navigate to overlay URL if not already there
      const username = extractUsername(tab.url);
      
      if (!username) {
        showStatus('Could not extract username from URL', 'error');
        return;
      }
      
      showStatus(`Navigating to recommendations overlay for ${username}...`, 'info');
      
      // Create the overlay URL
      const overlayUrl = `https://www.linkedin.com/in/${username}/overlay/browsemap-recommendations/`;
      
      // Navigate to the overlay URL
      await chrome.tabs.update(tab.id, { url: overlayUrl });
      
      // Wait for the page to load, then extract data
      showStatus('Waiting for page to load (5 seconds)...', 'info');
      
      // Give the page more time to load
      setTimeout(async () => {
        await extractDataFromCurrentPage(tab.id, companyName);
      }, 5000);
    }
    
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
    console.error(error);
  }
}

// Extract data from the current page
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
      
      // Check if there was a debug message
      if (response.debug) {
        console.log('Debug info:', response.debug);
      }
      
      const profiles = response.profiles || [];
      
      if (profiles.length > 0) {
        // Add only new profiles (avoid duplicates)
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
        // Show debug info if no profiles found
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

// This function runs in the context of the LinkedIn page
function extractProfileData(companyName) {
  const profiles = [];
  const companyLower = companyName.toLowerCase();
  const seenNames = new Set();
  let debugInfo = [];
  
  // Helper function to clean up names - FIXES DUPLICATE NAME BUG
  function cleanName(name) {
    if (!name) return '';
    
    // Remove connection degree indicators
    name = name.replace(/[•·]\s*(1st|2nd|3rd|\d+th)/gi, '');
    name = name.replace(/view\s+profile/gi, '');
    name = name.replace(/\bMessage\b/gi, '');
    name = name.replace(/\bConnect\b/gi, '');
    name = name.replace(/\s+/g, ' ').trim();
    
    // FIX: Check for duplicated names (e.g., "Aniket SharmaAniket Sharma")
    if (name.length >= 6) {
      // Try splitting at different positions around the middle
      const len = name.length;
      for (let i = Math.floor(len / 2) - 3; i <= Math.ceil(len / 2) + 3; i++) {
        if (i > 2 && i < len - 2) {
          const first = name.substring(0, i).trim();
          const second = name.substring(i).trim();
          if (first.toLowerCase() === second.toLowerCase() && first.length > 2) {
            return first;
          }
        }
      }
    }
    
    // Check word-by-word for patterns like "John Doe John Doe"
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
  
  // Try multiple strategies to find profile cards
  let profileCards = [];
  
  // Strategy 1: Look for the modal/overlay content
  const modalSelectors = [
    '.artdeco-modal__content',
    '[role="dialog"]',
    '.scaffold-finite-scroll__content',
    '.browsemap-recommendations',
    '[data-test-modal]'
  ];
  
  let container = null;
  for (const selector of modalSelectors) {
    container = document.querySelector(selector);
    if (container) {
      debugInfo.push(`Found container: ${selector}`);
      break;
    }
  }
  
  // Strategy 2: Find list items within the container or globally
  const listSelectors = [
    'li.artdeco-list__item',
    'li[class*="artdeco"]',
    '.entity-result',
    'li.reusable-search__result-container',
    '.pvs-list__item--line-separated',
    'ul > li'
  ];
  
  for (const selector of listSelectors) {
    const elements = container 
      ? container.querySelectorAll(selector)
      : document.querySelectorAll(selector);
    
    if (elements.length > 0) {
      profileCards = Array.from(elements);
      debugInfo.push(`Found ${elements.length} cards with: ${selector}`);
      break;
    }
  }
  
  // Strategy 3: Fallback - find all li elements in modal
  if (profileCards.length === 0 && container) {
    profileCards = Array.from(container.querySelectorAll('li'));
    debugInfo.push(`Fallback: Found ${profileCards.length} li elements in container`);
  }
  
  // Strategy 4: Last resort - search entire page for profile-like elements
  if (profileCards.length === 0) {
    const allLis = document.querySelectorAll('li');
    profileCards = Array.from(allLis).filter(li => {
      const text = li.textContent.toLowerCase();
      return text.includes(companyLower) || text.includes('connect') || text.includes('message');
    });
    debugInfo.push(`Last resort: Found ${profileCards.length} li elements containing keywords`);
  }
  
  debugInfo.push(`Total cards to process: ${profileCards.length}`);
  
  // Process each card
  profileCards.forEach((card, index) => {
    const text = card.textContent || '';
    const textLower = text.toLowerCase();
    
    // Check if company name is mentioned
    if (textLower.includes(companyLower)) {
      let name = '';
      
      // Multiple strategies to extract the name
      // Strategy A: aria-hidden spans (LinkedIn uses these for visible text)
      const ariaHiddenSpans = card.querySelectorAll('span[aria-hidden="true"]');
      for (const span of ariaHiddenSpans) {
        const spanText = span.textContent.trim();
        // Name is usually short and doesn't contain certain keywords
        if (spanText.length > 1 && 
            spanText.length < 40 && 
            !spanText.toLowerCase().includes(companyLower) &&
            !spanText.includes('•') &&
            !spanText.match(/^\d/) &&
            !spanText.toLowerCase().includes('connect') &&
            !spanText.toLowerCase().includes('message') &&
            !spanText.toLowerCase().includes('software') &&
            !spanText.toLowerCase().includes('engineer')) {
          name = spanText;
          break;
        }
      }
      
      // Strategy B: Link with /in/ href
      if (!name) {
        const profileLink = card.querySelector('a[href*="/in/"]');
        if (profileLink) {
          // Try aria-label first
          const ariaLabel = profileLink.getAttribute('aria-label');
          if (ariaLabel) {
            name = ariaLabel.replace(/^View\s+/i, '').replace(/'s\s+profile$/i, '').trim();
          }
          // Try first span inside link
          if (!name) {
            const linkSpan = profileLink.querySelector('span');
            if (linkSpan) {
              name = linkSpan.textContent.trim();
            }
          }
        }
      }
      
      // Strategy C: First meaningful text in the card
      if (!name) {
        const allSpans = card.querySelectorAll('span');
        for (const span of allSpans) {
          const spanText = span.textContent.trim();
          if (spanText.length > 2 && 
              spanText.length < 40 && 
              !spanText.includes('•') &&
              spanText.match(/^[A-Z]/)) { // Starts with capital letter
            name = spanText;
            break;
          }
        }
      }
      
      // Clean the name
      name = cleanName(name);
      
      // Validate and add
      if (name && name.length > 1 && name.length < 50 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        
        const searchQuery = encodeURIComponent(`site:linkedin.com/in/ "${name}" "${companyName}"`);
        const searchUrl = `https://www.google.com/search?q=${searchQuery}`;
        
        profiles.push({
          name: name,
          company: companyName,
          searchUrl: searchUrl
        });
        
        debugInfo.push(`✓ Extracted: "${name}"`);
      }
    }
  });
  
  return {
    profiles: profiles,
    totalCards: profileCards.length,
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
      <td><a href="${profile.searchUrl}" target="_blank" class="search-link">Search</a></td>
    `;
    tbody.appendChild(row);
  });
  
  resultsDiv.classList.remove('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Download as Excel (.xlsx)
function downloadExcel() {
  if (extractedData.length === 0) {
    showStatus('No data to download', 'error');
    return;
  }
  
  const excelData = extractedData.map((profile, index) => ({
    '#': index + 1,
    'Name': profile.name,
    'Company': profile.company,
    'Search URL': profile.searchUrl
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
  
  showStatus(`Excel file downloaded: ${fileName}`, 'success');
}

// Handle Excel file upload
function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      loadedExcelData = XLSX.utils.sheet_to_json(worksheet);
      loadedFileName = file.name;
      
      document.getElementById('loadedFileName').textContent = `✓ Loaded: ${file.name} (${loadedExcelData.length} rows)`;
      document.getElementById('appendToExcelBtn').disabled = false;
      
      showStatus(`Loaded ${loadedExcelData.length} existing records from Excel`, 'success');
    } catch (err) {
      showStatus('Error reading Excel file: ' + err.message, 'error');
      console.error(err);
    }
  };
  
  reader.readAsArrayBuffer(file);
}

// Append current data to loaded Excel and download
function appendToExcel() {
  if (extractedData.length === 0) {
    showStatus('No new data to append', 'error');
    return;
  }
  
  const existingNames = new Set(loadedExcelData.map(row => 
    (row.Name || row.name || '').toLowerCase()
  ));
  
  const newRecords = extractedData.filter(profile => 
    !existingNames.has(profile.name.toLowerCase())
  );
  
  if (newRecords.length === 0) {
    showStatus('All profiles already exist in the Excel file', 'info');
    return;
  }
  
  let maxIndex = 0;
  loadedExcelData.forEach(row => {
    const idx = parseInt(row['#'] || row.index || 0);
    if (idx > maxIndex) maxIndex = idx;
  });
  
  const newExcelRecords = newRecords.map((profile, i) => ({
    '#': maxIndex + i + 1,
    'Name': profile.name,
    'Company': profile.company,
    'Search URL': profile.searchUrl
  }));
  
  const allData = [...loadedExcelData, ...newExcelRecords];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(allData);
  
  ws['!cols'] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 25 },
    { wch: 70 }
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'LinkedIn Profiles');
  
  const baseName = loadedFileName.replace(/\.[^/.]+$/, '');
  const newFileName = `${baseName}_updated.xlsx`;
  
  XLSX.writeFile(wb, newFileName);
  
  showStatus(`Added ${newRecords.length} new profiles. Downloaded: ${newFileName}`, 'success');
}

function clearResults() {
  extractedData = [];
  loadedExcelData = [];
  loadedFileName = '';
  saveData();
  document.querySelector('#resultsTable tbody').innerHTML = '';
  document.getElementById('results').classList.add('hidden');
  document.getElementById('loadedFileName').textContent = '';
  document.getElementById('appendToExcelBtn').disabled = true;
  document.getElementById('excelFileInput').value = '';
  document.getElementById('profileCount').textContent = '0';
  hideStatus();
  
  checkCurrentTab();
}

function saveData() {
  chrome.storage.local.set({ extractedProfiles: extractedData });
}

function loadSavedData() {
  chrome.storage.local.get(['extractedProfiles'], (result) => {
    if (result.extractedProfiles && result.extractedProfiles.length > 0) {
      extractedData = result.extractedProfiles;
      displayResults();
    }
  });
}
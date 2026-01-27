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
      showStatus('Waiting for page to load...', 'info');
      
      // Give the page time to load
      setTimeout(async () => {
        await extractDataFromCurrentPage(tab.id, companyName);
      }, 3000);
    }
    
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
    console.error(error);
  }
}

// Extract data from the current page
async function extractDataFromCurrentPage(tabId, companyName) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: extractProfileData,
      args: [companyName]
    });
    
    if (results && results[0] && results[0].result) {
      const profiles = results[0].result;
      
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
        showStatus(`No profiles found matching "${companyName}"`, 'info');
      }
    } else {
      showStatus('No data extracted. Try scrolling down the overlay first.', 'info');
    }
  } catch (err) {
    showStatus('Error extracting data. Make sure the overlay is fully loaded.', 'error');
    console.error(err);
  }
}

function extractUsername(url) {
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/);
  return match ? match[1] : null;
}

// This function runs in the context of the LinkedIn page
// FIXED: Properly extracts unique names without duplication
function extractProfileData(companyName) {
  const profiles = [];
  const companyLower = companyName.toLowerCase();
  const seenNames = new Set();
  
  // Helper function to get only direct text content (not nested elements)
  function getDirectTextContent(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    if (!text.trim() && element.childNodes.length === 1) {
      text = element.textContent;
    }
    return text.trim();
  }
  
  // Helper function to clean up names - FIXES DUPLICATE NAME BUG
  function cleanName(name) {
    if (!name) return '';
    
    // Remove connection degree indicators
    name = name.replace(/[•·]\s*(1st|2nd|3rd|\d+th)/gi, '');
    
    // Remove "View profile" type text
    name = name.replace(/view\s+profile/gi, '');
    name = name.replace(/Message/gi, '');
    name = name.replace(/Connect/gi, '');
    
    // Remove extra whitespace
    name = name.replace(/\s+/g, ' ').trim();
    
    // FIX: Check for duplicated names (e.g., "Aniket SharmaAniket Sharma")
    // Method 1: Check if string is exactly doubled
    if (name.length >= 4) {
      const halfLen = Math.floor(name.length / 2);
      for (let i = halfLen - 2; i <= halfLen + 2; i++) {
        if (i > 0 && i < name.length) {
          const firstPart = name.substring(0, i).trim();
          const secondPart = name.substring(i).trim();
          if (firstPart.toLowerCase() === secondPart.toLowerCase() && firstPart.length > 2) {
            return firstPart;
          }
        }
      }
    }
    
    // Method 2: Check word-by-word for patterns like "John Doe John Doe"
    const words = name.split(/\s+/);
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2;
      const firstHalf = words.slice(0, half).join(' ');
      const secondHalf = words.slice(half).join(' ');
      if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
        return firstHalf;
      }
    }
    
    // Method 3: Use regex to find repeated patterns
    const repeatMatch = name.match(/^(.{2,})(\s*)\1$/i);
    if (repeatMatch) {
      return repeatMatch[1].trim();
    }
    
    return name;
  }
  
  // Find all profile cards in the recommendations overlay
  const selectors = [
    '.artdeco-modal__content li',
    '[data-test-modal] li',
    '.browsemap-recommendations li',
    '.artdeco-list__item',
    '.pvs-list__item--line-separated',
    '.scaffold-finite-scroll__content li',
    '.entity-result',
    '[data-view-name="profile-component-entity"]'
  ];
  
  let profileCards = [];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      profileCards = elements;
      break;
    }
  }
  
  // Fallback: look for any element containing profile info
  if (profileCards.length === 0) {
    const modal = document.querySelector('.artdeco-modal__content') || 
                  document.querySelector('[role="dialog"]') ||
                  document.querySelector('.scaffold-finite-scroll');
    if (modal) {
      profileCards = modal.querySelectorAll('li, .entity-result');
    }
  }
  
  profileCards.forEach((card) => {
    const text = card.textContent || '';
    const textLower = text.toLowerCase();
    
    // Check if company name is mentioned
    if (textLower.includes(companyLower)) {
      let name = '';
      
      // Try multiple selectors to find the name - prioritize aria-hidden spans
      const nameSelectors = [
        'span.artdeco-entity-lockup__title span[aria-hidden="true"]',
        '.artdeco-entity-lockup__title span[aria-hidden="true"]',
        '.entity-result__title-text span[aria-hidden="true"]',
        'a[href*="/in/"] span[aria-hidden="true"]',
        '.app-aware-link span[aria-hidden="true"]',
        'span[dir="ltr"] > span[aria-hidden="true"]'
      ];
      
      for (const selector of nameSelectors) {
        const el = card.querySelector(selector);
        if (el) {
          name = getDirectTextContent(el) || el.textContent.trim();
          if (name && name.length > 1 && name.length < 50) break;
        }
      }
      
      // Fallback: try to get name from link title or aria-label
      if (!name || name.length < 2) {
        const link = card.querySelector('a[href*="/in/"]');
        if (link) {
          name = link.getAttribute('aria-label') || link.getAttribute('title') || '';
          
          // Clean aria-label (might be "View Aniket Sharma's profile")
          name = name.replace(/^View\s+/i, '').replace(/'s\s+profile$/i, '').trim();
        }
      }
      
      // Clean up name - THIS FIXES THE DUPLICATE BUG
      name = cleanName(name);
      
      // Validate and add to profiles
      if (name && name.length > 1 && name.length < 50 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        
        // Create Google search URL
        const searchQuery = encodeURIComponent(`site:linkedin.com/in/ "${name}" "${companyName}"`);
        const searchUrl = `https://www.google.com/search?q=${searchQuery}`;
        
        profiles.push({
          name: name,
          company: companyName,
          searchUrl: searchUrl
        });
      }
    }
  });
  
  return profiles;
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

// Download as Excel (.xlsx) - ONLY EXCEL, NO CSV
function downloadExcel() {
  if (extractedData.length === 0) {
    showStatus('No data to download', 'error');
    return;
  }
  
  // Prepare data for Excel
  const excelData = extractedData.map((profile, index) => ({
    '#': index + 1,
    'Name': profile.name,
    'Company': profile.company,
    'Search URL': profile.searchUrl
  }));
  
  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 30 },  // Name
    { wch: 25 },  // Company
    { wch: 70 }   // Search URL
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'LinkedIn Profiles');
  
  // Generate and download
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
      
      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      loadedExcelData = XLSX.utils.sheet_to_json(worksheet);
      loadedFileName = file.name;
      
      // Update UI
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
  
  // Combine loaded data with new data
  const existingNames = new Set(loadedExcelData.map(row => 
    (row.Name || row.name || '').toLowerCase()
  ));
  
  // Filter out duplicates
  const newRecords = extractedData.filter(profile => 
    !existingNames.has(profile.name.toLowerCase())
  );
  
  if (newRecords.length === 0) {
    showStatus('All profiles already exist in the Excel file', 'info');
    return;
  }
  
  // Get the highest index from existing data
  let maxIndex = 0;
  loadedExcelData.forEach(row => {
    const idx = parseInt(row['#'] || row.index || 0);
    if (idx > maxIndex) maxIndex = idx;
  });
  
  // Prepare new records with proper indexing
  const newExcelRecords = newRecords.map((profile, i) => ({
    '#': maxIndex + i + 1,
    'Name': profile.name,
    'Company': profile.company,
    'Search URL': profile.searchUrl
  }));
  
  // Combine all data
  const allData = [...loadedExcelData, ...newExcelRecords];
  
  // Create new workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(allData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 30 },  // Name
    { wch: 25 },  // Company
    { wch: 70 }   // Search URL
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'LinkedIn Profiles');
  
  // Generate filename based on original
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
  
  // Re-check current tab
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
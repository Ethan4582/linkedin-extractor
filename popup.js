
let extractedData = [];
let currentTabUrl = '';
let excelUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const updateExcelBtn = document.getElementById('updateExcelBtn');
  const clearBtn = document.getElementById('clearBtn');
  const excelUrlInput = document.getElementById('excelUrl');
 
  loadSavedData();
  
  checkCurrentTab();
  
  startBtn.addEventListener('click', startExtraction);
  updateExcelBtn.addEventListener('click', updateExcel);
  clearBtn.addEventListener('click', clearResults);

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

async function startExtraction() {
  const companyName = document.getElementById('companyName').value.trim();
  
  if (!companyName) {
    showStatus('Please enter a company name', 'error');
    return;
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


function extractProfileData(companyName) {
  const profiles = [];
  const companyLower = companyName.toLowerCase();
  const seenNames = new Set();
  let debugInfo = [];
  
  function cleanName(name) {
    if (!name) return '';
    
   
    name = name.replace(/[•·]\s*(1st|2nd|3rd|\d+th)/gi, '');
    name = name.replace(/view\s+profile/gi, '');
    name = name.replace(/\bMessage\b/gi, '');
    name = name.replace(/\bConnect\b/gi, '');
    name = name.replace(/\s+/g, ' ').trim();
    
   
    if (name.length >= 6) {
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
  

  if (profileCards.length === 0 && container) {
    profileCards = Array.from(container.querySelectorAll('li'));
    debugInfo.push(`Fallback: Found ${profileCards.length} li elements in container`);
  }
  
  if (profileCards.length === 0) {
    const allLis = document.querySelectorAll('li');
    profileCards = Array.from(allLis).filter(li => {
      const text = li.textContent.toLowerCase();
      return text.includes(companyLower) || text.includes('connect') || text.includes('message');
    });
    debugInfo.push(`Last resort: Found ${profileCards.length} li elements containing keywords`);
  }
  
  debugInfo.push(`Total cards to process: ${profileCards.length}`);
 
  profileCards.forEach((card, index) => {
    const text = card.textContent || '';
    const textLower = text.toLowerCase();
    

    const hasConnectButton = card.querySelector('button[aria-label*="Connect"]') || 
                             card.querySelector('button[aria-label*="connect"]') ||
                             (textLower.includes('connect') && !textLower.includes('message'));
    
    
    if (textLower.includes(companyLower) && hasConnectButton) {
      let name = '';
      
 
      const ariaHiddenSpans = card.querySelectorAll('span[aria-hidden="true"]');
      for (const span of ariaHiddenSpans) {
        const spanText = span.textContent.trim();
      
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
      
    
      if (!name) {
        const profileLink = card.querySelector('a[href*="/in/"]');
        if (profileLink) {
       
          const ariaLabel = profileLink.getAttribute('aria-label');
          if (ariaLabel) {
            name = ariaLabel.replace(/^View\s+/i, '').replace(/'s\s+profile$/i, '').trim();
          }
      
          if (!name) {
            const linkSpan = profileLink.querySelector('span');
            if (linkSpan) {
              name = linkSpan.textContent.trim();
            }
          }
        }
      }
      
      if (!name) {
        const allSpans = card.querySelectorAll('span');
        for (const span of allSpans) {
          const spanText = span.textContent.trim();
          if (spanText.length > 2 && 
              spanText.length < 40 && 
              !spanText.includes('•') &&
              spanText.match(/^[A-Z]/)) { 
            name = spanText;
            break;
          }
        }
      }
      
   
      name = cleanName(name);
      
  
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

  if (excelUrl) {
    document.getElementById('updateExcelBtn').disabled = false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


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
  
  showStatus('Updating Excel file...', 'info');
  
  try {
 
    
    showStatus('⚠️ Direct Excel update requires API integration. Please download and manually upload.', 'error');
    
    
    downloadExcelData();
    
  } catch (error) {
    showStatus('Error updating Excel: ' + error.message, 'error');
    console.error(error);
  }
}


function downloadExcelData() {
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

function clearResults() {
  extractedData = [];
  saveData();
  document.querySelector('#resultsTable tbody').innerHTML = '';
  document.getElementById('results').classList.add('hidden');
  document.getElementById('profileCount').textContent = '0';
  document.getElementById('updateExcelBtn').disabled = true;
  hideStatus();
  
  checkCurrentTab();
}

function saveData() {
  
  chrome.storage.session.set({ extractedProfiles: extractedData });
}

function loadSavedData() {
  
  chrome.storage.session.get(['extractedProfiles'], (result) => {
    if (result.extractedProfiles && result.extractedProfiles.length > 0) {
      extractedData = result.extractedProfiles;
      displayResults();
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
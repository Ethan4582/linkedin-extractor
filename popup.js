
let extractedData = [];

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn = document.getElementById('clearBtn');
  const companyInput = document.getElementById('companyName');
  

  loadSavedData();
  
  startBtn.addEventListener('click', startExtraction);
  downloadBtn.addEventListener('click', downloadCSV);
  clearBtn.addEventListener('click', clearResults);
});

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
    

    if (!tab.url.includes('linkedin.com/in/')) {
      showStatus('Please navigate to a LinkedIn profile page first', 'error');
      return;
    }
    
  
    const username = extractUsername(tab.url);
    
    if (!username) {
      showStatus('Could not extract username from URL', 'error');
      return;
    }
    
    showStatus(`Found profile: ${username}. Navigating to recommendations...`, 'info');
    

    const overlayUrl = `https://www.linkedin.com/in/${username}/overlay/browsemap-recommendations/`;
    
    
    await chrome.tabs.update(tab.id, { url: overlayUrl });
    
   
    showStatus('Waiting for page to load...', 'info');
    
  
    setTimeout(async () => {
      try {
   
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractProfileData,
          args: [companyName]
        });
        
        if (results && results[0] && results[0].result) {
          const profiles = results[0].result;
          
          if (profiles.length > 0) {
            extractedData = [...extractedData, ...profiles];
            saveData();
            displayResults();
            showStatus(`Found ${profiles.length} matching profiles!`, 'success');
          } else {
            showStatus(`No profiles found matching "${companyName}"`, 'info');
          }
        }
      } catch (err) {
        showStatus('Error extracting data. Try again in a moment.', 'error');
        console.error(err);
      }
    }, 3000); 
    
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
    console.error(error);
  }
}

function extractUsername(url) {
 
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/);
  return match ? match[1] : null;
}

function extractProfileData(companyName) {
  const profiles = [];
  const companyLower = companyName.toLowerCase();
  

  const selectors = [
    '.artdeco-modal__content li',
    '[data-test-modal] li',
    '.browsemap-recommendations li',
    '.artdeco-list__item',
    '.pvs-list__item--line-separated',
    '.scaffold-finite-scroll__content li'
  ];
  
  let profileCards = [];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      profileCards = elements;
      break;
    }
  }
  

  if (profileCards.length === 0) {
   
    const modal = document.querySelector('.artdeco-modal__content') || 
                  document.querySelector('[role="dialog"]');
    if (modal) {
      profileCards = modal.querySelectorAll('li, .entity-result');
    }
  }
  
  profileCards.forEach((card, index) => {
   
    const text = card.textContent || '';
    const textLower = text.toLowerCase();
    
   
    if (textLower.includes(companyLower)) {
      // Try to extract name - usually in a link or heading
      let name = '';
      const nameElement = card.querySelector('a[href*="/in/"] span, .entity-result__title-text a, .artdeco-entity-lockup__title');
      
      if (nameElement) {
        name = nameElement.textContent.trim();
      } else {
       
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          name = lines[0].trim();
        }
      }
      
     
      name = name.replace(/[•·]\s*(1st|2nd|3rd|\d+th)/gi, '').trim();
      name = name.replace(/\s+/g, ' ');
      
      if (name && name.length > 1 && name.length < 100) {
       
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
  
  const uniqueProfiles = profiles.filter((profile, index, self) =>
    index === self.findIndex(p => p.name.toLowerCase() === profile.name.toLowerCase())
  );
  
  return uniqueProfiles;
}

function displayResults() {
  const resultsDiv = document.getElementById('results');
  const tbody = document.querySelector('#resultsTable tbody');
  
  tbody.innerHTML = '';
  
  extractedData.forEach((profile, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(profile.name)}</td>
      <td>${escapeHtml(profile.company)}</td>
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

function downloadCSV() {
  if (extractedData.length === 0) {
    showStatus('No data to download', 'error');
    return;
  }
  

  let csv = 'Name,Company,Search URL\n';
  
  extractedData.forEach(profile => {
    const name = `"${profile.name.replace(/"/g, '""')}"`;
    const company = `"${profile.company.replace(/"/g, '""')}"`;
    const url = `"${profile.searchUrl}"`;
    csv += `${name},${company},${url}\n`;
  });
  

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linkedin_profiles_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  showStatus('CSV downloaded!', 'success');
}

function clearResults() {
  extractedData = [];
  saveData();
  document.querySelector('#resultsTable tbody').innerHTML = '';
  document.getElementById('results').classList.add('hidden');
  hideStatus();
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
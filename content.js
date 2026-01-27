
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractProfiles') {
    const profiles = extractProfilesFromPage(request.companyName);
    sendResponse({ profiles: profiles });
  }
  return true; 
});

function extractProfilesFromPage(companyName) {
  const profiles = [];
  const companyLower = companyName.toLowerCase();
  

  const cards = document.querySelectorAll('.artdeco-modal__content li, .entity-result');
  
  cards.forEach((card) => {
    const text = card.textContent.toLowerCase();
    
    if (text.includes(companyLower)) {
      const nameEl = card.querySelector('a[href*="/in/"] span');
      if (nameEl) {
        const name = nameEl.textContent.trim();
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in/ "${name}" "${companyName}"`)}`;
        
        profiles.push({ name, company: companyName, searchUrl });
      }
    }
  });
  
  return profiles;
}


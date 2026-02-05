chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractProfiles') {
    const profiles = extractProfilesFromPage(request.companyName);
    sendResponse({ profiles: profiles });
  }
  return true; 
});

function extractProfilesFromPage(companyName) {
  const profiles = [];
  const seenUrls = new Set();

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

  // Find all profile links on the page
  const allProfileLinks = document.querySelectorAll('a[href*="/in/"]');

  allProfileLinks.forEach((aTag) => {
    const href = aTag.href || aTag.getAttribute('href');
    
    if (!href || !href.includes('/in/') || href.includes('/in/edit') || href.includes('/in/settings')) {
      return;
    }
    
    let profileUrl = href;
    if (!profileUrl.startsWith('http')) {
      profileUrl = 'https://www.linkedin.com' + href;
    }
    
    if (seenUrls.has(profileUrl)) return;

    // Extract name
    let name = '';
    const spanInLink = aTag.querySelector('span');
    if (spanInLink && spanInLink.textContent.trim()) {
      name = spanInLink.textContent.trim();
    } else if (aTag.textContent.trim()) {
      name = aTag.textContent.trim();
    }
    
    name = name.replace(/\s+/g, ' ').trim();
    name = name.replace(/^(View|Connect with|Message|Follow)\s+/i, '');
    name = name.replace(/('s profile|profile)$/i, '').trim();
    
    if (!name || name.length < 2 || name.length > 100) return;
    if (/^(connect|message|follow|view|more|see all|show|hide|settings|chapters|captions|off|on|\d+)$/i.test(name)) {
      return;
    }

    // Get parent context for company matching
    let cardContext = '';
    let parent = aTag.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      cardContext = parent.textContent || '';
      if (cardContext.length > 100) break;
      parent = parent.parentElement;
    }

    const contextLower = cardContext.toLowerCase();
    let companyMatch = false;
    for (const variant of companyVariants) {
      if (variant && contextLower.includes(variant.toLowerCase())) {
        companyMatch = true;
        break;
      }
    }

    if (!companyMatch) return;

    profiles.push({
      name,
      company: companyName,
      profileUrl
    });
    seenUrls.add(profileUrl);
  });

  return profiles;
}


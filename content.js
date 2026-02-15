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
  const allProfileLinks = document.querySelectorAll('a[href*="/in/"]');

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
    if (!matchesCompany(rawText, companyVariants)) return;

    profiles.push({ name, company: companyName, profileUrl });
    seenUrls.add(profileUrl);
  });

  return profiles;
}


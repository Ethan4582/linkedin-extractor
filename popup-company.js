(function () {
  'use strict';

  const extractCompanyBtn = document.getElementById('extractCompanyBtn');
  if (extractCompanyBtn) {
    extractCompanyBtn.addEventListener('click', startCompanyColleaguesExtraction);
  }

  async function startCompanyColleaguesExtraction() {
    let companyName = '';

    const companyInput = document.getElementById('companyName');
    if (typeof savedCompanyName !== 'undefined' && savedCompanyName) {
      companyName = savedCompanyName;
    } else if (companyInput && companyInput.value.trim()) {
      companyName = companyInput.value.trim();
    }

    if (!companyName) {
      showStatus('Please enter a company name first', 'error');
      return;
    }

    if (typeof lockCompanyName === 'function' && typeof savedCompanyName !== 'undefined' && !savedCompanyName) {
      lockCompanyName(companyName);
    }

    showStatus('Opening People you may know dialog...', 'info');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
        showStatus('Please navigate to a LinkedIn profile page first', 'error');
        return;
      }

      extractCompanyBtn.disabled = true;

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'extractCompanyColleagues',
        companyName: companyName
      });

      extractCompanyBtn.disabled = false;

      if (chrome.runtime.lastError) {
        showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (!response || response.error) {
        showStatus(response ? response.error : 'No response from page', 'error');
        return;
      }

      const profiles = response.profiles || [];

      if (profiles.length > 0) {
        const existingUrls = new Set(extractedData.map(p => p.profileUrl));
        const existingNames = new Set(extractedData.map(p => p.name.toLowerCase()));
        const newProfiles = profiles.filter(p =>
          !existingUrls.has(p.profileUrl) && !existingNames.has(p.name.toLowerCase())
        );

        extractedData = [...extractedData, ...newProfiles];
        saveData();
        filterAndRender();

        const skipped = profiles.length - newProfiles.length;
        if (skipped > 0) {
          showStatus(`Found ${newProfiles.length} company colleagues! (${skipped} duplicates skipped)`, 'success');
        } else {
          showStatus(`Found ${profiles.length} company colleagues!`, 'success');
        }
      } else {
        showStatus('No matching profiles found. Try a different company name or check the spelling.', 'info');
      }
    } catch (err) {
      extractCompanyBtn.disabled = false;
      showStatus('Error: ' + err.message, 'error');
      console.error('Company extraction error:', err);
    }
  }
})();

(function () {
  'use strict';

  const WAIT_AFTER_CLICK_MIN = 1200;
  const WAIT_AFTER_CLICK_MAX = 2000;
  const WAIT_BETWEEN_SCROLLS_MIN = 900;
  const WAIT_BETWEEN_SCROLLS_MAX = 1500;
  const WAIT_BEFORE_RESPONSE_MIN = 400;
  const WAIT_BEFORE_RESPONSE_MAX = 800;
  const MAX_SCROLL_ITERATIONS = 25;
  const POLL_INTERVAL = 350;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractCompanyColleagues') {
      extractCompanyColleagues(request.companyName)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ profiles: [], error: error.message }));
      return true;
    }
  });

  async function extractCompanyColleagues(companyName) {
    const debug = [];

    try {
      let dialog = findActiveDialog();

      if (!dialog) {
        debug.push('Dialog not open; attempting to open via LinkedIn UI');
        const opened = await openPeopleYouMayKnowDialog();
        if (!opened) {
          throw new Error('Could not open the dialog automatically. Please scroll to the "People you may know" section on the profile and click "Show all", then try again.');
        }
        await randomWait(WAIT_AFTER_CLICK_MIN, WAIT_AFTER_CLICK_MAX);
        dialog = await waitForElement(findActiveDialog, 10000);
        if (!dialog) {
          throw new Error('Dialog did not appear after opening.');
        }
      } else {
        debug.push('Dialog already open');
      }

      const tab = await findAndActivateCompanyTab(dialog);
      debug.push(`Company tab active: ${tab.tabText}`);

      await randomWait(WAIT_AFTER_CLICK_MIN, WAIT_AFTER_CLICK_MAX);

      const panel = await waitForElement(() => findActiveTabPanel(dialog), 8000);
      if (!panel) {
        throw new Error('Company tab panel did not load.');
      }

      debug.push('Scrolling to load lazy cards...');
      await scrollToLoadProfiles(dialog, panel);

      debug.push('Scraping company tab panel...');
      const profiles = scrapePanel(panel, companyName);
      debug.push(`Scraped ${profiles.length} profiles matching "${companyName}"`);

      await randomWait(WAIT_BEFORE_RESPONSE_MIN, WAIT_BEFORE_RESPONSE_MAX);

      return { profiles, debug: debug.join(' | ') };
    } catch (err) {
      return { profiles: [], error: err.message, debug: debug.join(' | ') };
    }
  }

  function randomWait(min, max) {
    const ms = Math.floor(min + Math.random() * (max - min));
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForElement(fn, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = fn();
      if (el) return el;
      await wait(POLL_INTERVAL);
    }
    return null;
  }

  function findActiveDialog() {
    const selectors = [
      'dialog[data-testid="dialog"][open]',
      'div[role="dialog"]',
      '[data-sdui-screen*="ProfileOverlayPykmList"]'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  async function openPeopleYouMayKnowDialog() {
    const section = findPeopleYouMayKnowSection();
    if (!section) return false;

    const trigger = findScopedTrigger(section);
    if (trigger) {
      trigger.click();
      return true;
    }

    return false;
  }

  function findPeopleYouMayKnowSection() {
    const candidates = document.querySelectorAll('section, div, li');
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const heading = findHeadingInElement(el);
      if (heading && /People you may know/i.test(heading.textContent || '')) {
        return el;
      }
    }
    return null;
  }

  function findHeadingInElement(el) {
    return el.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="header"]');
  }

  function findScopedTrigger(section) {
    const triggers = section.querySelectorAll('a, button');
    for (const trigger of triggers) {
      if (!isVisible(trigger)) continue;
      const text = (trigger.textContent || '').trim().toLowerCase();
      const label = (trigger.getAttribute('aria-label') || '').toLowerCase();
      const href = (trigger.getAttribute('href') || '') || '';
      if (href && href.includes('recent-activity')) continue;
      if (href && href.includes('/detail/')) continue;
      if (/^(show all|see all|view all)$/.test(text)) return trigger;
      if (/people you may know/.test(label)) return trigger;
    }
    return null;
  }

  function findElementByText(regex, selector) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (regex.test(el.textContent || '')) return el;
    }
    return null;
  }

  async function findAndActivateCompanyTab(dialog) {
    const tablist = dialog.querySelector('[role="tablist"]') ||
                    dialog.querySelector('[data-testid="tabs-measurement-wrapper"]');
    if (!tablist) {
      throw new Error('Could not find tab list in dialog.');
    }

    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    if (tabs.length === 0) {
      throw new Error('No tabs found in dialog.');
    }

    const companyTab = tabs.find(tab => isCompanyTab(tab));
    if (!companyTab) {
      throw new Error('Could not find the "People who work at the same company" tab.');
    }

    const tabText = (companyTab.textContent || '').trim();

    const isActive = companyTab.getAttribute('aria-selected') === 'true' ||
                     companyTab.getAttribute('aria-expanded') === 'true';

    if (!isActive) {
      companyTab.click();
      await randomWait(WAIT_AFTER_CLICK_MIN, WAIT_AFTER_CLICK_MAX);
    }

    return { tab: companyTab, tabText };
  }

  function isCompanyTab(tab) {
    const text = (tab.textContent || '').trim();
    if (/From .*?'s company$/i.test(text)) return true;
    if (text.toLowerCase() === 'company') return true;
    const lower = text.toLowerCase();
    if (lower.includes('company') && !lower.includes('school') && !lower.includes('industry')) return true;
    return false;
  }

  function findActiveTabPanel(dialog) {
    const panel = dialog.querySelector('[role="tabpanel"][aria-hidden="false"]');
    if (panel) return panel;
    const visiblePanel = Array.from(dialog.querySelectorAll('[role="tabpanel"]')).find(isVisible);
    return visiblePanel || null;
  }

  async function scrollToLoadProfiles(dialog, panel) {
    const scrollContainer = dialog.querySelector('[data-testid="dialog-content"]') || panel;
    let lastCount = 0;
    let staleCount = 0;
    let lastHeight = scrollContainer.scrollHeight;

    for (let i = 0; i < MAX_SCROLL_ITERATIONS; i++) {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      await randomWait(WAIT_BETWEEN_SCROLLS_MIN, WAIT_BETWEEN_SCROLLS_MAX);

      const anchors = panel.querySelectorAll('a[href*="/in/"]');
      const currentCount = anchors.length;
      const currentHeight = scrollContainer.scrollHeight;

      if (currentCount === lastCount && currentHeight === lastHeight) {
        staleCount++;
        if (staleCount >= 2) break;
      } else {
        staleCount = 0;
      }

      lastCount = currentCount;
      lastHeight = currentHeight;
    }
  }

  function scrapePanel(panel, companyName) {
    const profiles = [];
    const seenUrls = new Set();
    const companyVariants = generateCompanyVariants(companyName);
    const anchors = panel.querySelectorAll('a[href*="/in/"]');

    anchors.forEach(aTag => {
      const href = aTag.href || aTag.getAttribute('href');
      if (!href || !href.includes('/in/') || href.includes('/in/edit') || href.includes('/in/settings')) return;

      let profileUrl = href;
      if (!profileUrl.startsWith('http')) profileUrl = 'https://www.linkedin.com' + href;
      profileUrl = profileUrl.split('?')[0];
      if (seenUrls.has(profileUrl)) return;

      const rawText = collectCardText(aTag);
      const name = extractName(aTag.textContent || '');

      if (!name || name.length < 2 || name.length > 60) return;
      if (/^(connect|message|follow|view|more|see all|show|hide|settings|chapters|captions|off|on|\d+)$/i.test(name)) return;
      if (!matchesCompany(rawText, companyVariants)) return;

      profiles.push({ name, company: companyName, profileUrl });
      seenUrls.add(profileUrl);
    });

    return profiles;
  }

  function collectCardText(anchor) {
    let text = anchor.textContent || '';
    let parent = anchor.parentElement;
    for (let i = 0; i < 4; i++) {
      if (!parent) break;
      text += ' ' + (parent.textContent || '');
      parent = parent.parentElement;
    }
    return text;
  }

  function generateCompanyVariants(name) {
    const variants = new Set();
    const original = name.trim();
    variants.add(original.toLowerCase());
    variants.add(original.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').toLowerCase());
    variants.add(original.replace(/\s+/g, '').toLowerCase());
    variants.add(original.replace(/\./g, ' ').toLowerCase());
    variants.add(original.replace(/-/g, ' ').toLowerCase());
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
})();

/* ============================================================
   HomeHunt — main app logic
   ============================================================ */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Element references
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const loginError = document.getElementById('login-error');
const logoutButton = document.getElementById('logout-button');
const topBarTitle = document.getElementById('top-bar-title');

const propertiesList = document.getElementById('properties-list');
const calendarSection = document.getElementById('calendar-section');
const addPropertyButton = document.getElementById('add-property-button');
const addPropertyModal = document.getElementById('add-property-modal');
const addPropertyForm = document.getElementById('add-property-form');
const cancelAddButton = document.getElementById('cancel-add-button');
const modalTitle = document.getElementById('modal-title');
const deletePropertyButton = document.getElementById('delete-property-button');
const savePropertyButton = document.getElementById('save-property-button');

// URL fetch elements
const fetchUrlInput = document.getElementById('fetch-url-input');
const fetchUrlButton = document.getElementById('fetch-url-button');
const fetchStatus = document.getElementById('fetch-status');

// Calendar elements
const calMonthLabel = document.getElementById('cal-month-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
const calendarGrid = document.getElementById('calendar-grid');
const calendarDayDetails = document.getElementById('calendar-day-details');

// State
let currentEditingId = null;
let allProperties = [];
let calendarMonth = new Date();
let selectedDate = null;
let fetchedImageUrl = null;


/* ============================================================
   AUTH
   ============================================================ */

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) showAppScreen();
  else showLoginScreen();
}

function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

function showAppScreen() {
     loginScreen.classList.add('hidden');
     appScreen.classList.remove('hidden');
     loadProperties();
     setupPushNotifications();
   }

   async function setupPushNotifications() {
     // Wait for OneSignal to be ready
     if (!window.OneSignalDeferred) return;
     
     window.OneSignalDeferred.push(async function(OneSignal) {
       try {
         // Get the current logged-in user
         const { data: { user } } = await sb.auth.getUser();
         if (!user) return;

         // Tell OneSignal who this user is (so we can target them later)
         await OneSignal.login(user.id);

         // Check if they've already decided on notifications
         const permission = OneSignal.Notifications.permission;
         if (permission === false) {
           // Hasn't decided yet — show the permission prompt
           await OneSignal.Notifications.requestPermission();
         }
       } catch (err) {
         console.warn('OneSignal setup failed:', err);
       }
     });
   }

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginButton.textContent = 'Logging in…';
  loginButton.disabled = true;

  const { error } = await sb.auth.signInWithPassword({
    email: loginEmail.value.trim(),
    password: loginPassword.value
  });

  loginButton.textContent = 'Log In';
  loginButton.disabled = false;

  if (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
    return;
  }

  loginPassword.value = '';
  showAppScreen();
});

logoutButton.addEventListener('click', async () => {
  await sb.auth.signOut();
  showLoginScreen();
});


/* ============================================================
   LOAD PROPERTIES
   ============================================================ */

async function loadProperties() {
  propertiesList.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await sb
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    propertiesList.innerHTML = `<p class="empty-state">Error loading: ${error.message}</p>`;
    return;
  }

  allProperties = data || [];

  if (allProperties.length === 0) {
    propertiesList.innerHTML = `
      <p class="empty-state">
        No properties yet.<br>
        Tap the + button to add your first one.
      </p>`;
  } else {
    propertiesList.innerHTML = '';
    allProperties.forEach(property => {
      propertiesList.appendChild(buildPropertyCard(property));
    });
  }

  if (!calendarSection.classList.contains('hidden')) renderCalendar();
}

function buildPropertyCard(property) {
  const card = document.createElement('div');
  card.className = 'property-card';
  card.dataset.id = property.id;

  const statusLabels = {
    saved: 'Saved',
    viewing_booked: 'Viewing Booked',
    viewed: 'Viewed',
    shortlisted: 'Shortlisted',
    rejected: 'Rejected'
  };

  let viewingText = '';
  if (property.viewing_date) {
    const d = new Date(property.viewing_date);
    viewingText = `📅 ${d.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short'
    })} · ${d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit'
    })}`;
  }

  const rentText = property.monthly_rent ? `£${property.monthly_rent}/mo` : '';
  const bedroomsText = property.bedrooms ? `${property.bedrooms} bed` : '';

  const imageHtml = property.main_image_url
    ? `<img class="main-image" src="${escapeHtml(property.main_image_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';

  card.innerHTML = `
    ${imageHtml}
    <div class="address">${escapeHtml(property.address)}</div>
    ${property.nickname ? `<div class="nickname">${escapeHtml(property.nickname)}</div>` : ''}
    <div class="meta">
      <span class="status-badge status-${property.status}">${statusLabels[property.status] || property.status}</span>
      ${viewingText ? `<span class="viewing-date">${viewingText}</span>` : ''}
      ${rentText ? `<span class="rent">${rentText}</span>` : ''}
      ${bedroomsText ? `<span class="bedrooms">${bedroomsText}</span>` : ''}
    </div>
  `;

  card.addEventListener('click', () => openEditModal(property));
  return card;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


/* ============================================================
   TAB BAR
   ============================================================ */

document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  if (tab === 'properties') {
    propertiesList.classList.remove('hidden');
    calendarSection.classList.add('hidden');
    addPropertyButton.classList.remove('hidden');
    topBarTitle.textContent = 'Properties';
  } else if (tab === 'calendar') {
    propertiesList.classList.add('hidden');
    calendarSection.classList.remove('hidden');
    addPropertyButton.classList.add('hidden');
    topBarTitle.textContent = 'Calendar';
    renderCalendar();
  }
}


/* ============================================================
   CALENDAR
   ============================================================ */

calPrev.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});
calNext.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  calMonthLabel.textContent = calendarMonth.toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric'
  });

  const viewingsByDay = {};
  allProperties.forEach(p => {
    if (!p.viewing_date) return;
    const d = new Date(p.viewing_date);
    const key = dateKey(d);
    if (!viewingsByDay[key]) viewingsByDay[key] = [];
    viewingsByDay[key].push(p);
  });

  const firstOfMonth = new Date(year, month, 1);
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - dayOfWeek);

  calendarGrid.innerHTML = '';
  const today = new Date();
  const todayKey = dateKey(today);

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const key = dateKey(cellDate);

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (cellDate.getMonth() !== month) cell.classList.add('other-month');
    if (key === todayKey) cell.classList.add('today');
    if (viewingsByDay[key]) cell.classList.add('has-viewing');
    if (selectedDate && key === selectedDate) cell.classList.add('selected');

    cell.textContent = cellDate.getDate();
    cell.addEventListener('click', () => {
      selectedDate = key;
      renderCalendar();
      renderDayDetails(viewingsByDay[key] || [], cellDate);
    });

    calendarGrid.appendChild(cell);
  }

  if (selectedDate) {
    const [y, m, d] = selectedDate.split('-').map(Number);
    renderDayDetails(viewingsByDay[selectedDate] || [], new Date(y, m - 1, d));
  } else {
    calendarDayDetails.innerHTML = '<p class="no-viewings">Tap a date to see viewings</p>';
  }
}

function renderDayDetails(viewings, date) {
  const heading = date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  if (viewings.length === 0) {
    calendarDayDetails.innerHTML = `
      <p class="day-details-heading">${heading}</p>
      <p class="no-viewings">No viewings on this day</p>
    `;
    return;
  }

  viewings.sort((a, b) => new Date(a.viewing_date) - new Date(b.viewing_date));

  calendarDayDetails.innerHTML = `<p class="day-details-heading">${heading}</p>`;
  viewings.forEach(p => {
    const time = new Date(p.viewing_date).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit'
    });
    const item = document.createElement('div');
    item.className = 'viewing-item';
    item.innerHTML = `
      <span class="time">${time}</span>
      <span class="address">${escapeHtml(p.address)}</span>
    `;
    item.addEventListener('click', () => openEditModal(p));
    calendarDayDetails.appendChild(item);
  });
}

function dateKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}


/* ============================================================
   URL FETCHING — Rightmove & Zoopla
   ============================================================ */

fetchUrlButton.addEventListener('click', fetchPropertyFromUrl);

async function fetchPropertyFromUrl() {
  const url = fetchUrlInput.value.trim();
  if (!url) return;

  const isRightmove = /rightmove\.co\.uk/i.test(url);
  const isZoopla = /zoopla\.co\.uk/i.test(url);

  if (!isRightmove && !isZoopla) {
    showFetchStatus('Only Rightmove and Zoopla URLs are supported.', 'error');
    return;
  }

  showFetchStatus('Fetching listing details…', 'loading');
  fetchUrlButton.disabled = true;

  try {
       // Try multiple CORS proxies — free ones go down regularly
       const proxies = [
         (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
         (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
         (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
         (u) => `https://proxy.cors.sh/${u}`
       ];

       let html = null;
       let lastError = null;

       for (const buildProxyUrl of proxies) {
         try {
           const proxyUrl = buildProxyUrl(url);
           const response = await fetch(proxyUrl, {
             headers: { 'x-requested-with': 'XMLHttpRequest' }
           });
           if (!response.ok) {
             lastError = `HTTP ${response.status}`;
             continue;
           }
           html = await response.text();
           if (html && html.length > 1000) break; // got something real
           html = null;
         } catch (e) {
           lastError = e.message;
           continue;
         }
       }

       if (!html) {
         throw new Error(`All proxies failed (last: ${lastError})`);
       }

    const details = isRightmove ? parseRightmove(html) : parseZoopla(html);

    // Fill form fields from what we got
    if (details.address) {
      document.getElementById('property-address').value = details.address;
    }
    if (details.rent) {
      document.getElementById('property-rent').value = details.rent;
    }
    if (details.bedrooms) {
      document.getElementById('property-bedrooms').value = details.bedrooms;
    }
    // Store image for saving later
    fetchedImageUrl = details.imageUrl || null;
    // Store listing URL
    document.getElementById('property-listing-url').value = url;

    // Build a success message listing what we filled
    const filled = [];
    if (details.address) filled.push('address');
    if (details.rent) filled.push('rent');
    if (details.bedrooms) filled.push('bedrooms');
    if (details.imageUrl) filled.push('image');

    if (filled.length === 0) {
      showFetchStatus('Couldn\'t extract details — please fill manually.', 'error');
    } else {
      showFetchStatus(`Filled: ${filled.join(', ')}. Check and adjust if needed.`, 'success');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    showFetchStatus('Could not fetch listing. Try again or fill manually.', 'error');
  } finally {
    fetchUrlButton.disabled = false;
  }
}

function showFetchStatus(message, type) {
  fetchStatus.textContent = message;
  fetchStatus.className = `fetch-status ${type}`;
  fetchStatus.classList.remove('hidden');
}

function parseRightmove(html) {
  const result = {};

  // Find the PAGE_MODEL JSON by locating "window.PAGE_MODEL = " then counting braces
  const marker = 'window.PAGE_MODEL = ';
  const start = html.indexOf(marker);
  if (start !== -1) {
    const jsonStart = start + marker.length;
    const jsonStr = extractJsonObject(html, jsonStart);
    if (jsonStr) {
      try {
        const model = JSON.parse(jsonStr);
        const prop = model.propertyData || {};

        if (prop.address && prop.address.displayAddress) {
          result.address = prop.address.displayAddress;
        }
        if (prop.prices && prop.prices.primaryPrice) {
          const priceStr = String(prop.prices.primaryPrice).replace(/[^\d]/g, '');
          if (priceStr) result.rent = parseInt(priceStr, 10);
        }
        if (typeof prop.bedrooms === 'number') {
          result.bedrooms = prop.bedrooms;
        }
        if (prop.images && prop.images.length > 0) {
          const firstImg = prop.images[0];
          result.imageUrl = firstImg.url || firstImg.srcUrl || null;
        }
      } catch (e) {
        console.warn('Rightmove JSON parse failed:', e.message);
      }
    }
  }

  // Fallback: extract title minus "Rightmove" branding
  if (!result.address) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      // Strip trailing "- Rightmove" or "on Rightmove"
      result.address = titleMatch[1].replace(/\s*[-|]\s*Rightmove\s*$/i, '').trim();
    }
  }

  // Fallback: preloaded image URL (the big hero image)
  if (!result.imageUrl) {
    const heroImg = html.match(/rel="preload"[^>]+as="image"[^>]+href="([^"]+)"/i);
    if (heroImg) result.imageUrl = heroImg[1];
  }

  // Fallback: price from meta description or visible text
  if (!result.rent) {
    const priceMatch = html.match(/£([\d,]+)\s*(?:pcm|per month|\/month)/i);
    if (priceMatch) {
      result.rent = parseInt(priceMatch[1].replace(/,/g, ''), 10);
    }
  }

  // Fallback: bedrooms from title
  if (!result.bedrooms) {
    const bedMatch = html.match(/(\d+)\s*bed(?:room)?/i);
    if (bedMatch) result.bedrooms = parseInt(bedMatch[1], 10);
  }

  return result;
}

// Helper: given a string and a starting index (pointing at '{'),
// return the full JSON object string by counting braces
function extractJsonObject(str, startIdx) {
  // Advance to first '{'
  while (startIdx < str.length && str[startIdx] !== '{') startIdx++;
  if (startIdx >= str.length) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return str.substring(startIdx, i + 1);
      }
    }
  }

  return null;
}

function parseZoopla(html) {
  const result = {};

  // Zoopla uses JSON-LD structured data
  const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const scriptTag of jsonLdMatches) {
      try {
        const jsonText = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
        const data = JSON.parse(jsonText);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Residence' || item['@type'] === 'Product' || item['@type'] === 'SingleFamilyResidence' || item['@type'] === 'Apartment') {
            if (item.address) {
              if (typeof item.address === 'string') result.address = item.address;
              else if (item.address.streetAddress) {
                result.address = [item.address.streetAddress, item.address.addressLocality, item.address.postalCode].filter(Boolean).join(', ');
              }
            }
            if (item.numberOfRooms) result.bedrooms = parseInt(item.numberOfRooms, 10);
            if (item.image) {
              result.imageUrl = Array.isArray(item.image) ? item.image[0] : item.image;
            }
          }
          if (item.offers && item.offers.price) {
            result.rent = parseInt(item.offers.price, 10);
          }
        }
      } catch (e) {
        // skip bad JSON-LD blocks
      }
    }
  }

  // Fallback to OpenGraph
  if (!result.address) {
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitle) result.address = ogTitle[1];
  }
  if (!result.imageUrl) {
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogImage) result.imageUrl = ogImage[1];
  }

  // Zoopla price fallback — look for £X,XXX pcm pattern
  if (!result.rent) {
    const priceMatch = html.match(/£([\d,]+)\s*(?:pcm|per month)/i);
    if (priceMatch) {
      result.rent = parseInt(priceMatch[1].replace(/,/g, ''), 10);
    }
  }

  return result;
}


/* ============================================================
   MODAL
   ============================================================ */

function openAddModal() {
  currentEditingId = null;
  fetchedImageUrl = null;
  modalTitle.textContent = 'Add Property';
  savePropertyButton.textContent = 'Save';
  deletePropertyButton.classList.add('hidden');
  addPropertyForm.reset();
  fetchStatus.classList.add('hidden');
  document.getElementById('property-status').value = 'saved';
  addPropertyModal.classList.remove('hidden');
}

function openEditModal(property) {
  currentEditingId = property.id;
  fetchedImageUrl = property.main_image_url || null;
  modalTitle.textContent = 'Edit Property';
  savePropertyButton.textContent = 'Save changes';
  deletePropertyButton.classList.remove('hidden');
  fetchStatus.classList.add('hidden');
  fetchUrlInput.value = '';

  document.getElementById('property-address').value = property.address || '';
  document.getElementById('property-nickname').value = property.nickname || '';
  document.getElementById('property-bedrooms').value = property.bedrooms || '';
  document.getElementById('property-status').value = property.status || 'saved';
  document.getElementById('property-listing-url').value = property.listing_url || '';
  document.getElementById('property-rent').value = property.monthly_rent || '';
  document.getElementById('property-notes').value = property.general_notes || '';

  if (property.viewing_date) {
    const d = new Date(property.viewing_date);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    document.getElementById('property-viewing-date').value = local;
  } else {
    document.getElementById('property-viewing-date').value = '';
  }

  addPropertyModal.classList.remove('hidden');
}

function closeModal() {
  addPropertyModal.classList.add('hidden');
  addPropertyForm.reset();
  fetchStatus.classList.add('hidden');
  currentEditingId = null;
  fetchedImageUrl = null;
}

addPropertyButton.addEventListener('click', openAddModal);
cancelAddButton.addEventListener('click', closeModal);

addPropertyModal.addEventListener('click', (e) => {
  if (e.target === addPropertyModal) closeModal();
});


/* ============================================================
   SAVE PROPERTY
   ============================================================ */

addPropertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    alert('You appear to be logged out. Please log in again.');
    showLoginScreen();
    return;
  }

  const viewingDateValue = document.getElementById('property-viewing-date').value;
  const rentValue = document.getElementById('property-rent').value;
  const bedroomsValue = document.getElementById('property-bedrooms').value;

  const propertyData = {
    address: document.getElementById('property-address').value.trim(),
    nickname: document.getElementById('property-nickname').value.trim() || null,
    status: document.getElementById('property-status').value,
    viewing_date: viewingDateValue ? new Date(viewingDateValue).toISOString() : null,
    listing_url: document.getElementById('property-listing-url').value.trim() || null,
    monthly_rent: rentValue ? Number(rentValue) : null,
    bedrooms: bedroomsValue ? Number(bedroomsValue) : null,
    general_notes: document.getElementById('property-notes').value.trim() || null,
    main_image_url: fetchedImageUrl
  };

  let error;
  if (currentEditingId) {
    const res = await sb.from('properties').update(propertyData).eq('id', currentEditingId);
    error = res.error;
  } else {
    propertyData.created_by = user.id;
    const res = await sb.from('properties').insert(propertyData);
    error = res.error;
  }

  if (error) {
    alert('Could not save property: ' + error.message);
    return;
  }

  closeModal();
  loadProperties();
});


/* ============================================================
   DELETE PROPERTY
   ============================================================ */

deletePropertyButton.addEventListener('click', async () => {
  if (!currentEditingId) return;
  const confirmed = confirm('Delete this property? This cannot be undone.');
  if (!confirmed) return;

  const { error } = await sb.from('properties').delete().eq('id', currentEditingId);
  if (error) {
    alert('Could not delete: ' + error.message);
    return;
  }

  closeModal();
  loadProperties();
});


/* ============================================================
   START
   ============================================================ */
checkSession();
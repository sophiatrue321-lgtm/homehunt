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


/* ============================================================
   AUTH
   ============================================================ */

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showAppScreen();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

function showAppScreen() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  loadProperties();
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

  // If calendar is currently showing, re-render it with fresh data
  if (!calendarSection.classList.contains('hidden')) {
    renderCalendar();
  }
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

  card.innerHTML = `
    <div class="address">${escapeHtml(property.address)}</div>
    ${property.nickname ? `<div class="nickname">${escapeHtml(property.nickname)}</div>` : ''}
    <div class="meta">
      <span class="status-badge status-${property.status}">${statusLabels[property.status] || property.status}</span>
      ${viewingText ? `<span class="viewing-date">${viewingText}</span>` : ''}
      ${rentText ? `<span class="rent">${rentText}</span>` : ''}
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
   TAB BAR — switch between Properties and Calendar
   ============================================================ */

document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    switchTab(tab);
  });
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

  // Build a map of YYYY-MM-DD → list of properties with viewings that day
  const viewingsByDay = {};
  allProperties.forEach(p => {
    if (!p.viewing_date) return;
    const d = new Date(p.viewing_date);
    const key = dateKey(d);
    if (!viewingsByDay[key]) viewingsByDay[key] = [];
    viewingsByDay[key].push(p);
  });

  // First cell of the grid — Monday of the week containing the 1st
  const firstOfMonth = new Date(year, month, 1);
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7; // shift Sun=0 → Mon=0
  const gridStart = new Date(year, month, 1 - dayOfWeek);

  calendarGrid.innerHTML = '';
  const today = new Date();
  const todayKey = dateKey(today);

  // 6 rows × 7 days = 42 cells (standard calendar grid)
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

  // If a date was already selected, re-render its details
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

  // Sort by time
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
   MODAL
   ============================================================ */

function openAddModal() {
  currentEditingId = null;
  modalTitle.textContent = 'Add Property';
  savePropertyButton.textContent = 'Save';
  deletePropertyButton.classList.add('hidden');
  addPropertyForm.reset();
  document.getElementById('property-status').value = 'saved';
  addPropertyModal.classList.remove('hidden');
}

function openEditModal(property) {
  currentEditingId = property.id;
  modalTitle.textContent = 'Edit Property';
  savePropertyButton.textContent = 'Save changes';
  deletePropertyButton.classList.remove('hidden');

  document.getElementById('property-address').value = property.address || '';
  document.getElementById('property-nickname').value = property.nickname || '';
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
  currentEditingId = null;
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

  const propertyData = {
    address: document.getElementById('property-address').value.trim(),
    nickname: document.getElementById('property-nickname').value.trim() || null,
    status: document.getElementById('property-status').value,
    viewing_date: viewingDateValue ? new Date(viewingDateValue).toISOString() : null,
    listing_url: document.getElementById('property-listing-url').value.trim() || null,
    monthly_rent: rentValue ? Number(rentValue) : null,
    general_notes: document.getElementById('property-notes').value.trim() || null
  };

  let error;
  if (currentEditingId) {
    const res = await sb
      .from('properties')
      .update(propertyData)
      .eq('id', currentEditingId);
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

  const { error } = await sb
    .from('properties')
    .delete()
    .eq('id', currentEditingId);

  if (error) {
    alert('Could not delete: ' + error.message);
    return;
  }

  closeModal();
  loadProperties();
});


/* ============================================================
   START THE APP
   ============================================================ */
checkSession();
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

const propertiesList = document.getElementById('properties-list');
const addPropertyButton = document.getElementById('add-property-button');
const addPropertyModal = document.getElementById('add-property-modal');
const addPropertyForm = document.getElementById('add-property-form');
const cancelAddButton = document.getElementById('cancel-add-button');
const modalTitle = document.getElementById('modal-title');
const deletePropertyButton = document.getElementById('delete-property-button');
const savePropertyButton = document.getElementById('save-property-button');

// Track which property we're editing (null = adding new)
let currentEditingId = null;


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

  if (!data || data.length === 0) {
    propertiesList.innerHTML = `
      <p class="empty-state">
        No properties yet.<br>
        Tap the + button to add your first one.
      </p>`;
    return;
  }

  propertiesList.innerHTML = '';
  data.forEach(property => {
    propertiesList.appendChild(buildPropertyCard(property));
  });
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

  // Tap card to edit
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
   MODAL — add mode vs edit mode
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

  // Pre-fill the form with existing values
  document.getElementById('property-address').value = property.address || '';
  document.getElementById('property-nickname').value = property.nickname || '';
  document.getElementById('property-status').value = property.status || 'saved';
  document.getElementById('property-listing-url').value = property.listing_url || '';
  document.getElementById('property-rent').value = property.monthly_rent || '';
  document.getElementById('property-notes').value = property.general_notes || '';

  // datetime-local needs a specific format: YYYY-MM-DDTHH:MM
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
   SAVE PROPERTY — handles both add and edit
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
    // EDIT mode — update existing row
    const res = await sb
      .from('properties')
      .update(propertyData)
      .eq('id', currentEditingId);
    error = res.error;
  } else {
    // ADD mode — insert new row
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
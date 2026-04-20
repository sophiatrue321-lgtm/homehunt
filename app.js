/* ============================================================
   HomeHunt — main app logic
   ============================================================ */

// Initialise Supabase client using values from config.js
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Grab references to the HTML elements we'll interact with
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


/* ============================================================
   AUTH — login, logout, session check
   ============================================================ */

// When the page first loads, check if we're already logged in
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

// Handle login form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginButton.textContent = 'Logging in…';
  loginButton.disabled = true;

  const { error } = await supabase.auth.signInWithPassword({
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

// Handle logout
logoutButton.addEventListener('click', async () => {
  await supabase.auth.signOut();
  showLoginScreen();
});


/* ============================================================
   LOAD PROPERTIES — read from Supabase and render the list
   ============================================================ */

async function loadProperties() {
  propertiesList.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await supabase
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

// Build a single property card HTML element
function buildPropertyCard(property) {
  const card = document.createElement('div');
  card.className = 'property-card';

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

  return card;
}

// Prevent any HTML injection in user-entered text
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


/* ============================================================
   ADD PROPERTY — modal + form submit
   ============================================================ */

addPropertyButton.addEventListener('click', () => {
  addPropertyModal.classList.remove('hidden');
});

cancelAddButton.addEventListener('click', () => {
  addPropertyModal.classList.add('hidden');
  addPropertyForm.reset();
});

// Close modal if user taps outside the white content area
addPropertyModal.addEventListener('click', (e) => {
  if (e.target === addPropertyModal) {
    addPropertyModal.classList.add('hidden');
    addPropertyForm.reset();
  }
});

addPropertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('You appear to be logged out. Please log in again.');
    showLoginScreen();
    return;
  }

  const viewingDateValue = document.getElementById('property-viewing-date').value;
  const rentValue = document.getElementById('property-rent').value;

  const newProperty = {
    address: document.getElementById('property-address').value.trim(),
    nickname: document.getElementById('property-nickname').value.trim() || null,
    status: document.getElementById('property-status').value,
    viewing_date: viewingDateValue ? new Date(viewingDateValue).toISOString() : null,
    listing_url: document.getElementById('property-listing-url').value.trim() || null,
    monthly_rent: rentValue ? Number(rentValue) : null,
    general_notes: document.getElementById('property-notes').value.trim() || null,
    created_by: user.id
  };

  const { error } = await supabase.from('properties').insert(newProperty);

  if (error) {
    alert('Could not save property: ' + error.message);
    return;
  }

  addPropertyForm.reset();
  addPropertyModal.classList.add('hidden');
  loadProperties();
});


/* ============================================================
   START THE APP
   ============================================================ */
checkSession();
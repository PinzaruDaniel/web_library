"use strict";

// ================================================================
//  BOOK CLASS
// ================================================================
class Book {
    constructor({ id, title, author, genre, status, year, pages, isbn, rating, description, isFavorite, dateAdded }) {
        this.id          = id          || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        this.title       = String(title).trim();
        this.author      = String(author).trim();
        this.genre       = String(genre).trim();
        this.status      = status      || 'to-read';
        this.year        = Number(year);
        this.pages       = pages ? Number(pages) : null;
        this.isbn        = isbn        || '';
        this.rating      = rating ? Number(rating) : 0;
        this.description = description || '';
        this.isFavorite  = Boolean(isFavorite);
        this.dateAdded   = dateAdded   || new Date().toISOString();
    }

    // Method 1: human-readable summary
    getSummary() {
        const ratingStr = this.rating ? '★'.repeat(this.rating) + '☆'.repeat(5 - this.rating) : 'Unrated';
        return `"${this.title}" by ${this.author} (${this.year}) — ${this.genre} — ${ratingStr}`;
    }

    getAge() {
        return new Date().getFullYear() - this.year;
    }

    toExportLine() {
        return [
            this.title, this.author, this.genre, this.year,
            this.pages || 'N/A', this.status, this.rating ? '★'.repeat(this.rating) : '-',
            this.isbn || 'N/A', this.description || ''
        ].join(' | ');
    }
}

const STORAGE_KEY  = 'bibliotheca_books';
const PREFS_KEY    = 'bibliotheca_prefs';
const PAGE_SIZE    = 8;

let books          = [];
let filteredBooks  = [];
let currentPage    = 1;
let sortField      = '';
let sortDir        = '';
let searchTerm     = '';
let timerInterval  = null;
let timerTotal     = 0;
let timerRemaining = 0;
let timerRunning   = false;

const prefs = {
    theme:      'light',
    filterGenre:  '',
    filterStatus: '',
    filterRating: '',
    sortField:    '',
    sortDir:      '',
    pageSize:     PAGE_SIZE
};

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function starsHTML(n) {
    if (!n) return '<span style="color:var(--text-light);font-size:0.78rem">No rating</span>';
    return '★'.repeat(n) + '<span style="opacity:0.3">★</span>'.repeat(5 - n);
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status) {
    const map = {
        'reading': ['badge-status-reading', '📖 Reading'],
        'read':    ['badge-status-read',    '✓ Read'],
        'to-read': ['badge-status-to-read', '🔖 To Read'],
    };
    const [cls, label] = map[status] || ['badge-status-to-read', status];
    return `<span class="badge ${cls}">${label}</span>`;
}

function escapeHTML(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ================================================================
//  STORAGE
// ================================================================

function saveBooks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function loadBooks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            books = parsed.map(b => new Book(b));
        }
    } catch(e) {
        books = [];
    }
}

function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function loadPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) Object.assign(prefs, JSON.parse(raw));
    } catch(e) {}
}

// ================================================================
//  NOTIFICATIONS
// ================================================================

function notify(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `notif notif-${type}`;
    const icons = { success:'✓', error:'✕', info:'ℹ', gold:'★' };
    el.innerHTML = `<span>${icons[type] || 'ℹ'}</span>${escapeHTML(msg)}`;
    document.getElementById('notifications').appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

// ================================================================
//  FORM VALIDATION
// ================================================================

function validateField(fieldEl, errorEl, condition, liveCheck = false) {
    if (!condition) {
        fieldEl.classList.add('error');
        errorEl.classList.add('show');
        return false;
    } else {
        fieldEl.classList.remove('error');
        errorEl.classList.remove('show');
        return true;
    }
}

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidISBN(v)  { const d = v.replace(/[-\s]/g,''); return /^(\d{10}|\d{13})$/.test(d); }
function isValidIsbnOrEmail(v) { return !v || isValidISBN(v) || isValidEmail(v); }

function validateMainForm() {
    const title  = document.getElementById('fTitle').value.trim();
    const author = document.getElementById('fAuthor').value.trim();
    const genre  = document.getElementById('fGenre').value;
    const year   = parseInt(document.getElementById('fYear').value);
    const pages  = document.getElementById('fPages').value;
    const isbn   = document.getElementById('fIsbn').value.trim();

    let ok = true;
    ok = validateField(document.getElementById('fTitle'),  document.getElementById('errTitle'),  title.length >= 2) && ok;
    ok = validateField(document.getElementById('fAuthor'), document.getElementById('errAuthor'), author.length >= 2) && ok;
    ok = validateField(document.getElementById('fGenre'),  document.getElementById('errGenre'),  genre !== '') && ok;
    ok = validateField(document.getElementById('fYear'),   document.getElementById('errYear'),   !isNaN(year) && year >= 1000 && year <= 2100) && ok;
    if (pages) ok = validateField(document.getElementById('fPages'), document.getElementById('errPages'), parseInt(pages) > 0) && ok;
    ok = validateField(document.getElementById('fIsbn'),   document.getElementById('errIsbn'),   isValidIsbnOrEmail(isbn)) && ok;
    return ok;
}

function validateModalForm() {
    const title  = document.getElementById('mTitle').value.trim();
    const author = document.getElementById('mAuthor').value.trim();
    const genre  = document.getElementById('mGenre').value;
    const year   = parseInt(document.getElementById('mYear').value);
    const pages  = document.getElementById('mPages').value;
    const isbn   = document.getElementById('mIsbn').value.trim();

    let ok = true;
    ok = validateField(document.getElementById('mTitle'),  document.getElementById('mErrTitle'),  title.length >= 2) && ok;
    ok = validateField(document.getElementById('mAuthor'), document.getElementById('mErrAuthor'), author.length >= 2) && ok;
    ok = validateField(document.getElementById('mGenre'),  document.getElementById('mErrGenre'),  genre !== '') && ok;
    ok = validateField(document.getElementById('mYear'),   document.getElementById('mErrYear'),   !isNaN(year) && year >= 1000 && year <= 2100) && ok;
    if (pages) ok = validateField(document.getElementById('mPages'), document.getElementById('mErrPages'), parseInt(pages) > 0) && ok;
    ok = validateField(document.getElementById('mIsbn'),   document.getElementById('mErrIsbn'),   isValidIsbnOrEmail(isbn)) && ok;
    return ok;
}

// Live validation on input
['fTitle','fAuthor','fYear','fPages','fIsbn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        const errMap = { fTitle:'errTitle', fAuthor:'errAuthor', fYear:'errYear', fPages:'errPages', fIsbn:'errIsbn' };
        const errEl = document.getElementById(errMap[id]);
        if (!errEl) return;
        if (id === 'fTitle'  && el.value.trim().length >= 2)                        { el.classList.remove('error'); errEl.classList.remove('show'); }
        if (id === 'fAuthor' && el.value.trim().length >= 2)                        { el.classList.remove('error'); errEl.classList.remove('show'); }
        if (id === 'fYear'   && parseInt(el.value) >= 1000 && parseInt(el.value) <= 2100) { el.classList.remove('error'); errEl.classList.remove('show'); }
        if (id === 'fPages'  && (!el.value || parseInt(el.value) > 0))              { el.classList.remove('error'); errEl.classList.remove('show'); }
        if (id === 'fIsbn'   && isValidIsbnOrEmail(el.value.trim()))                { el.classList.remove('error'); errEl.classList.remove('show'); }
    });
    el.addEventListener('blur', () => {
        validateMainForm();
    });
});

// ================================================================
//  ADD / EDIT BOOK
// ================================================================

function getFormData(prefix = 'f') {
    const ratingEl = document.querySelector(`input[name="${prefix === 'm' ? 'm' : ''}rating"]:checked`);
    return {
        title:       document.getElementById(prefix + 'Title').value.trim(),
        author:      document.getElementById(prefix + 'Author').value.trim(),
        genre:       document.getElementById(prefix + 'Genre').value,
        status:      document.getElementById(prefix + 'Status').value,
        year:        document.getElementById(prefix + 'Year').value,
        pages:       document.getElementById(prefix + 'Pages').value,
        isbn:        document.getElementById(prefix + 'Isbn').value.trim(),
        rating:      ratingEl ? Number(ratingEl.value) : 0,
        description: document.getElementById(prefix + 'Desc').value.trim(),
    };
}

function clearForm() {
    document.getElementById('bookForm').reset();
    document.querySelectorAll('#bookForm .field-error').forEach(e => e.classList.remove('show'));
    document.querySelectorAll('#bookForm input, #bookForm select, #bookForm textarea').forEach(e => e.classList.remove('error'));
    document.getElementById('editId').value = '';
    document.getElementById('formTitle').textContent = 'Add New Book';
    document.getElementById('submitBtn').textContent = '➕ Add Book';
    document.getElementById('cancelEdit').style.display = 'none';
}

document.getElementById('bookForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateMainForm()) {
        notify('Please fix the errors in the form', 'error');
        return;
    }
    const data = getFormData('f');
    const editId = document.getElementById('editId').value;

    if (editId) {
        // Edit mode
        const idx = books.findIndex(b => b.id === editId);
        if (idx !== -1) {
            Object.assign(books[idx], data);
            books[idx].year   = Number(data.year);
            books[idx].pages  = data.pages ? Number(data.pages) : null;
            books[idx].rating = Number(data.rating);
            notify(`"${data.title}" updated successfully!`, 'info');
        }
        clearForm();
    } else {
        // Add mode
        const book = new Book(data);
        books.unshift(book);
        notify(`"${book.title}" added to your library!`, 'success');
        clearForm();
    }
    saveBooks();
    applyFiltersAndRender();
});

document.getElementById('cancelEdit').addEventListener('click', clearForm);

document.getElementById('bookForm').addEventListener('reset', () => {
    setTimeout(() => {
        document.querySelectorAll('#bookForm .field-error').forEach(e => e.classList.remove('show'));
        document.querySelectorAll('#bookForm input, #bookForm select, #bookForm textarea').forEach(e => e.classList.remove('error'));
    }, 10);
});

// ================================================================
//  DELETE BOOK
// ================================================================

function deleteBook(id) {
    const book = books.find(b => b.id === id);
    if (!book) return;
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return;
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) {
        card.classList.add('removing');
        setTimeout(() => { doDelete(id); }, 280);
    } else {
        doDelete(id);
    }
}

function doDelete(id) {
    const book = books.find(b => b.id === id);
    books = books.filter(b => b.id !== id);
    saveBooks();
    applyFiltersAndRender();
    if (book) notify(`"${book.title}" removed from library`, 'info');
}

// ================================================================
//  TOGGLE FAVORITE
// ================================================================

function toggleFavorite(id) {
    const book = books.find(b => b.id === id);
    if (!book) return;
    book.isFavorite = !book.isFavorite;
    saveBooks();
    applyFiltersAndRender();
    notify(book.isFavorite ? `Added "${book.title}" to favourites ⭐` : `Removed from favourites`, book.isFavorite ? 'gold' : 'info');
}

// ================================================================
//  OPEN EDIT MODAL
// ================================================================

function openEditModal(id) {
    const book = books.find(b => b.id === id);
    if (!book) return;
    document.getElementById('mEditId').value    = book.id;
    document.getElementById('mTitle').value     = book.title;
    document.getElementById('mAuthor').value    = book.author;
    document.getElementById('mGenre').value     = book.genre;
    document.getElementById('mStatus').value    = book.status;
    document.getElementById('mYear').value      = book.year;
    document.getElementById('mPages').value     = book.pages || '';
    document.getElementById('mIsbn').value      = book.isbn;
    document.getElementById('mDesc').value      = book.description;
    if (book.rating) {
        const rEl = document.getElementById(`mr${book.rating}`);
        if (rEl) rEl.checked = true;
    } else {
        document.querySelectorAll('input[name="mRating"]').forEach(r => r.checked = false);
    }
    document.querySelectorAll('#modalOverlay .field-error').forEach(e => e.classList.remove('show'));
    document.querySelectorAll('#modalOverlay input, #modalOverlay select, #modalOverlay textarea').forEach(e => e.classList.remove('error'));
    document.getElementById('modalOverlay').classList.remove('hidden');
}

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.add('hidden');
});

document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
});

document.getElementById('modalForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateModalForm()) { notify('Please fix form errors', 'error'); return; }
    const id   = document.getElementById('mEditId').value;
    const idx  = books.findIndex(b => b.id === id);
    if (idx === -1) return;
    const rEl  = document.querySelector('input[name="mRating"]:checked');
    books[idx].title       = document.getElementById('mTitle').value.trim();
    books[idx].author      = document.getElementById('mAuthor').value.trim();
    books[idx].genre       = document.getElementById('mGenre').value;
    books[idx].status      = document.getElementById('mStatus').value;
    books[idx].year        = Number(document.getElementById('mYear').value);
    books[idx].pages       = document.getElementById('mPages').value ? Number(document.getElementById('mPages').value) : null;
    books[idx].isbn        = document.getElementById('mIsbn').value.trim();
    books[idx].rating      = rEl ? Number(rEl.value) : 0;
    books[idx].description = document.getElementById('mDesc').value.trim();
    saveBooks();
    applyFiltersAndRender();
    document.getElementById('modalOverlay').classList.add('hidden');
    notify(`"${books[idx].title}" saved successfully!`, 'success');
});

// ================================================================
//  FILTER, SORT, SEARCH
// ================================================================

function applyFiltersAndRender() {
    let result = [...books];
    const genre  = document.getElementById('filterGenre').value;
    const status = document.getElementById('filterStatus').value;
    const rating = document.getElementById('filterRating').value;

    prefs.filterGenre  = genre;
    prefs.filterStatus = status;
    prefs.filterRating = rating;
    savePrefs();

    if (genre)  result = result.filter(b => b.genre === genre);
    if (status) result = result.filter(b => b.status === status);
    if (rating) result = result.filter(b => b.rating >= Number(rating));

    // search
    if (searchTerm) {
        const q = searchTerm.toLowerCase();
        result = result.filter(b =>
            b.title.toLowerCase().includes(q)  ||
            b.author.toLowerCase().includes(q) ||
            b.genre.toLowerCase().includes(q)  ||
            String(b.year).includes(q)         ||
            b.description.toLowerCase().includes(q)
        );
    }

    // sort
    if (sortField) {
        result.sort((a, b) => {
            let va = a[sortField], vb = b[sortField];
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ?  1 : -1;
            return 0;
        });
    }

    filteredBooks = result;
    renderBooks();
    renderFavorites();
    renderStats();
    renderPagination();
}

// ================================================================
//  RENDER BOOKS
// ================================================================

function renderBooks() {
    const grid = document.getElementById('booksGrid');
    grid.innerHTML = '';

    if (filteredBooks.length === 0) {
        grid.innerHTML = `<div class="empty-msg" style="grid-column:1/-1">
      ${books.length === 0 ? 'Your library is empty. Add your first book! 📖' : 'No books match your filters. 🔍'}
    </div>`;
        document.getElementById('bookCount').textContent = '0';
        return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageBooks = filteredBooks.slice(start, start + PAGE_SIZE);

    pageBooks.forEach(book => {
        const card = document.createElement('div');
        card.className = `book-card${book.isFavorite ? ' favorite' : ''}`;
        card.dataset.id = book.id;
        card.addEventListener('mouseover', () => {});
        card.addEventListener('mouseout',  () => {});

        card.innerHTML = `
      <div class="book-header">
        <div class="book-title">${escapeHTML(book.title)}</div>
        <div class="book-actions">
          <button class="btn-icon btn-fav${book.isFavorite ? ' active' : ''}" title="${book.isFavorite ? 'Remove from favourites' : 'Add to favourites'}" data-action="fav" data-id="${book.id}">⭐</button>
          <button class="btn-icon" title="Edit" data-action="edit" data-id="${book.id}">✏️</button>
          <button class="btn-icon" title="Delete" data-action="delete" data-id="${book.id}" style="border-color:rgba(192,57,43,0.3);color:var(--accent-red)">🗑</button>
        </div>
      </div>
      <div class="book-author">by ${escapeHTML(book.author)}</div>
      <div class="book-meta">
        <span class="badge badge-genre">${escapeHTML(book.genre)}</span>
        ${statusBadge(book.status)}
        ${book.year ? `<span class="badge" style="background:rgba(0,0,0,0.05);color:var(--text-muted)">${book.year}</span>` : ''}
        ${book.pages ? `<span class="badge" style="background:rgba(0,0,0,0.05);color:var(--text-light)">${book.pages}p</span>` : ''}
      </div>
      <div class="book-stars">${starsHTML(book.rating)}</div>
      ${book.description ? `<div class="book-desc">${escapeHTML(book.description)}</div>` : ''}
      <div class="book-footer">
        <span>Added ${formatDate(book.dateAdded)}</span>
        <span>${book.getAge() > 0 ? book.getAge() + 'y old' : 'New'}</span>
      </div>
    `;
        grid.appendChild(card);
    });

    document.getElementById('bookCount').textContent = filteredBooks.length;

    // Delegated click events on grid
    grid.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const { action, id } = btn.dataset;
            if (action === 'fav')    toggleFavorite(id);
            if (action === 'edit')   openEditModal(id);
            if (action === 'delete') deleteBook(id);
        });
    });
}

// ================================================================
//  RENDER FAVORITES
// ================================================================

function renderFavorites() {
    const favs = books.filter(b => b.isFavorite);
    const list  = document.getElementById('favsList');
    document.getElementById('favCount').textContent = favs.length;
    list.innerHTML = '';
    if (favs.length === 0) {
        list.innerHTML = '<div class="empty-msg">No favourites yet</div>';
        return;
    }
    favs.forEach(book => {
        const item = document.createElement('div');
        item.className = 'fav-item';
        item.innerHTML = `
      <span class="fav-icon">⭐</span>
      <div class="fav-info">
        <div class="fav-title">${escapeHTML(book.title)}</div>
        <div class="fav-author">${escapeHTML(book.author)}</div>
      </div>
      <button class="btn-icon btn-sm" title="Remove from favourites" data-fav-id="${book.id}" style="border:none;font-size:0.75rem;color:var(--text-light)">✕</button>
    `;
        item.querySelector('[data-fav-id]').addEventListener('click', e => {
            e.stopPropagation();
            toggleFavorite(book.id);
        });
        item.addEventListener('click', () => openEditModal(book.id));
        list.appendChild(item);
    });
}

// ================================================================
//  RENDER STATISTICS
// ================================================================

function renderStats() {
    const total    = books.length;
    const reading  = books.filter(b => b.status === 'reading').length;
    const read     = books.filter(b => b.status === 'read').length;
    const toRead   = books.filter(b => b.status === 'to-read').length;
    const favs     = books.filter(b => b.isFavorite).length;
    const totalPages = books.reduce((s, b) => s + (b.pages || 0), 0);
    const avgRating  = books.filter(b => b.rating).length
        ? (books.filter(b => b.rating).reduce((s, b) => s + b.rating, 0) / books.filter(b => b.rating).length).toFixed(1)
        : '—';

    const statsGrid = document.getElementById('statsGrid');
    const statsData = [
        { num: total,      label: 'Total Books' },
        { num: read,       label: 'Read' },
        { num: reading,    label: 'Reading' },
        { num: toRead,     label: 'To Read' },
        { num: favs,       label: 'Favourites' },
        { num: avgRating,  label: 'Avg Rating' },
        { num: totalPages > 0 ? totalPages.toLocaleString() : 0, label: 'Total Pages' },
    ];
    statsGrid.innerHTML = statsData.map(s => `
    <div class="stat-card">
      <div class="stat-num">${s.num}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');

    // Genre bars
    const genreCounts = {};
    books.forEach(b => { genreCounts[b.genre] = (genreCounts[b.genre] || 0) + 1; });
    const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxCount = sortedGenres[0] ? sortedGenres[0][1] : 1;
    document.getElementById('genreBars').innerHTML = sortedGenres.length === 0
        ? '<div class="empty-msg" style="padding:0.5rem">No data</div>'
        : sortedGenres.map(([g, c]) => `
        <div class="genre-bar-item">
          <span class="genre-bar-label">${escapeHTML(g)}</span>
          <div class="genre-bar-track"><div class="genre-bar-fill" style="width:${(c/maxCount*100).toFixed(1)}%"></div></div>
          <span class="genre-bar-count">${c}</span>
        </div>
      `).join('');
}

// ================================================================
//  RENDER PAGINATION
// ================================================================

function renderPagination() {
    const totalPages = Math.ceil(filteredBooks.length / PAGE_SIZE);
    const container  = document.getElementById('pagination');
    container.innerHTML = '';

    if (totalPages <= 1) return;

    if (currentPage > totalPages) currentPage = totalPages;

    const makeBtn = (label, page, disabled, active) => {
        const btn = document.createElement('button');
        btn.className = `page-btn${active ? ' active' : ''}`;
        btn.textContent = label;
        btn.disabled = disabled;
        if (!disabled && !active) btn.addEventListener('click', () => { currentPage = page; renderBooks(); renderPagination(); });
        return btn;
    };

    container.appendChild(makeBtn('«', 1, currentPage === 1, false));
    container.appendChild(makeBtn('‹', currentPage - 1, currentPage === 1, false));

    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= delta) {
            container.appendChild(makeBtn(i, i, false, i === currentPage));
        } else if (Math.abs(i - currentPage) === delta + 1) {
            const dots = document.createElement('span');
            dots.className = 'page-info'; dots.textContent = '…';
            container.appendChild(dots);
        }
    }

    container.appendChild(makeBtn('›', currentPage + 1, currentPage === totalPages, false));
    container.appendChild(makeBtn('»', totalPages, currentPage === totalPages, false));

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `Page ${currentPage} / ${totalPages}`;
    container.appendChild(info);
}

// ================================================================
//  SORT HANDLERS
// ================================================================

function setSortField(field, arrowId) {
    ['sortTitleArrow','sortYearArrow','sortRatingArrow','sortPagesArrow'].forEach(id => {
        document.getElementById(id).textContent = '↕';
    });
    ['sortTitle','sortYear','sortRating','sortPages'].forEach(id => {
        document.getElementById(id).classList.remove('active');
    });

    if (sortField === field && sortDir === 'asc') {
        sortDir = 'desc';
        document.getElementById(arrowId).textContent = '↓';
    } else {
        sortField = field;
        sortDir   = 'asc';
        document.getElementById(arrowId).textContent = '↑';
    }
    prefs.sortField = sortField;
    prefs.sortDir   = sortDir;
    savePrefs();
    currentPage = 1;
    applyFiltersAndRender();
    document.getElementById('sort' + field.charAt(0).toUpperCase() + field.slice(1)).classList.add('active');
}

document.getElementById('sortTitle').addEventListener('click',  () => setSortField('title',  'sortTitleArrow'));
document.getElementById('sortYear').addEventListener('click',   () => setSortField('year',   'sortYearArrow'));
document.getElementById('sortRating').addEventListener('click', () => setSortField('rating', 'sortRatingArrow'));
document.getElementById('sortPages').addEventListener('click',  () => setSortField('pages',  'sortPagesArrow'));

// ================================================================
//  SEARCH
// ================================================================

let searchTimeout;
function handleSearch(val) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchTerm  = val.toLowerCase().trim();
        currentPage = 1;
        applyFiltersAndRender();
    }, 220);
}

document.getElementById('globalSearch').addEventListener('input', e => {
    document.getElementById('localSearch').value = e.target.value;
    handleSearch(e.target.value);
});
document.getElementById('localSearch').addEventListener('input', e => {
    document.getElementById('globalSearch').value = e.target.value;
    handleSearch(e.target.value);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.getElementById('globalSearch').value = '';
        document.getElementById('localSearch').value  = '';
        searchTerm = '';
        applyFiltersAndRender();
        document.getElementById('modalOverlay').classList.add('hidden');
    }
});

// ================================================================
//  FILTER CHANGE
// ================================================================

['filterGenre','filterStatus','filterRating'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => { currentPage = 1; applyFiltersAndRender(); });
});

document.getElementById('resetFilters').addEventListener('click', () => {
    document.getElementById('filterGenre').value  = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterRating').value = '';
    document.getElementById('globalSearch').value = '';
    document.getElementById('localSearch').value  = '';
    searchTerm  = '';
    sortField   = '';
    sortDir     = '';
    currentPage = 1;
    ['sortTitleArrow','sortYearArrow','sortRatingArrow','sortPagesArrow'].forEach(id => { document.getElementById(id).textContent = '↕'; });
    ['sortTitle','sortYear','sortRating','sortPages'].forEach(id => { document.getElementById(id).classList.remove('active'); });
    applyFiltersAndRender();
    notify('Filters reset', 'info');
});

// ================================================================
//  EXPORT
// ================================================================

function exportBooks() {
    if (books.length === 0) { notify('No books to export!', 'error'); return; }
    const lines = [
        '╔═══════════════════════════════════════════════════════════╗',
        '║          BIBLIOTHECA — Virtual Library Export              ║',
        `║          Generated: ${new Date().toLocaleString()}`.padEnd(61) + '║',
        '╚═══════════════════════════════════════════════════════════╝',
        '',
        'TITLE | AUTHOR | GENRE | YEAR | PAGES | STATUS | RATING | ISBN | DESCRIPTION',
        '─'.repeat(80),
        ...books.map(b => b.toExportLine()),
        '',
        '─'.repeat(80),
        `Total books: ${books.length}`,
        `Favourites:  ${books.filter(b => b.isFavorite).length}`,
        `Total pages: ${books.reduce((s,b) => s + (b.pages||0), 0).toLocaleString()}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bibliotheca-export-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${books.length} books!`, 'success');
}

document.getElementById('exportBtn').addEventListener('click', exportBooks);

// ================================================================
//  CLEAR ALL
// ================================================================

document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (books.length === 0) { notify('Library is already empty', 'info'); return; }
    if (!confirm(`Delete all ${books.length} books? This cannot be undone!`)) return;
    books = [];
    saveBooks();
    applyFiltersAndRender();
    notify('Library cleared', 'info');
});

// ================================================================
//  DARK / LIGHT THEME
// ================================================================

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
    prefs.theme = theme;
    savePrefs();
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
    notify(`Switched to ${prefs.theme} mode`, 'info');
});

// ================================================================
//  LIVE CLOCK  (setInterval)
// ================================================================

function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').textContent =
        now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ================================================================
//  COUNTDOWN TIMER
// ================================================================

function secondsToHMS(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function updateTimerDisplay() {
    document.getElementById('timerDigits').textContent = secondsToHMS(timerRemaining);
    const pct = timerTotal > 0 ? (timerRemaining / timerTotal) * 100 : 100;
    document.getElementById('timerBar').style.width = pct + '%';
    if (timerRemaining <= 60 && timerRunning) {
        document.getElementById('timerDigits').style.color = 'var(--accent-red)';
    } else {
        document.getElementById('timerDigits').style.color = 'var(--accent)';
    }
}

document.getElementById('timerStart').addEventListener('click', () => {
    if (timerRunning) return;
    const h = parseInt(document.getElementById('timerH').value) || 0;
    const m = parseInt(document.getElementById('timerM').value) || 0;
    const s = parseInt(document.getElementById('timerS').value) || 0;
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) { notify('Set a valid time first', 'error'); return; }
    if (timerRemaining === 0) {
        timerTotal     = total;
        timerRemaining = total;
    }
    timerRunning = true;
    document.getElementById('timerLabel').textContent = 'Reading session in progress…';
    timerInterval = setInterval(() => {
        timerRemaining--;
        updateTimerDisplay();
        if (timerRemaining <= 0) {
            clearInterval(timerInterval);
            timerRunning   = false;
            timerRemaining = 0;
            document.getElementById('timerLabel').textContent = '✓ Session complete!';
            updateTimerDisplay();
            alert('⏱ Reading session complete! Great job!');
            notify('Reading session complete! 🎉', 'gold');
        }
    }, 1000);
    updateTimerDisplay();
});

document.getElementById('timerPause').addEventListener('click', () => {
    if (!timerRunning) return;
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('timerLabel').textContent = 'Paused';
});

document.getElementById('timerReset').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerRunning   = false;
    timerRemaining = 0;
    timerTotal     = 0;
    document.getElementById('timerLabel').textContent = 'Set your reading goal';
    updateTimerDisplay();
});

// ================================================================
//  BROWSER INFO BAR  (navigator.userAgent)
// ================================================================

(function() {
    const ua = navigator.userAgent;
    let browser = 'Unknown Browser';
    if      (ua.includes('Firefox'))   browser = 'Firefox';
    else if (ua.includes('Edg'))       browser = 'Edge';
    else if (ua.includes('Chrome'))    browser = 'Chrome';
    else if (ua.includes('Safari'))    browser = 'Safari';
    else if (ua.includes('Opera'))     browser = 'Opera';
    const bar = document.getElementById('browserBar');
    bar.textContent = `Bibliotheca is running on ${browser} — all data stored locally in your browser`;
})();

// ================================================================
//  SEED DATA (first run)
// ================================================================

const SEED_BOOKS = [
    { title: 'One Hundred Years of Solitude', author: 'Gabriel García Márquez', genre: 'Fiction', status: 'read', year: 1967, pages: 417, rating: 5, description: 'A landmark of magical realism following the Buendía family through seven generations.', isFavorite: true },
    { title: 'The Name of the Rose',           author: 'Umberto Eco',             genre: 'Mystery',  status: 'read', year: 1980, pages: 502, rating: 4, description: 'A medieval mystery set in an Italian monastery involving a series of mysterious deaths.' },
    { title: 'Sapiens',                         author: 'Yuval Noah Harari',       genre: 'History',  status: 'reading', year: 2011, pages: 443, rating: 4, description: 'A sweeping narrative of humankind from the Stone Age to the twenty-first century.' },
    { title: 'Dune',                            author: 'Frank Herbert',            genre: 'Science Fiction', status: 'to-read', year: 1965, pages: 688, rating: 5, description: 'An epic tale of politics, religion and ecology on the desert planet Arrakis.', isFavorite: true },
    { title: 'Crime and Punishment',            author: 'Fyodor Dostoevsky',       genre: 'Fiction', status: 'read', year: 1866, pages: 671, rating: 5, description: 'The psychological torment of a young man who commits murder and wrestles with guilt.' },
    { title: 'The Hitchhiker\'s Guide to the Galaxy', author: 'Douglas Adams', genre: 'Science Fiction', status: 'read', year: 1979, pages: 193, rating: 4, description: 'A comic science fiction adventure following an ordinary man through the universe.' },
    { title: 'The Great Gatsby',                author: 'F. Scott Fitzgerald',     genre: 'Fiction', status: 'to-read', year: 1925, pages: 180, rating: 3, description: 'A portrait of the Jazz Age and the American Dream through the mysterious Jay Gatsby.' },
    { title: 'A Brief History of Time',         author: 'Stephen Hawking',         genre: 'Science', status: 'read', year: 1988, pages: 212, rating: 4, description: 'A landmark volume in science writing by one of the greatest minds of our time.' },
    { title: 'The Little Prince',               author: 'Antoine de Saint-Exupéry',genre: 'Children', status: 'read', year: 1943, pages: 96, rating: 5, description: 'A poetic tale about a young prince who travels the universe asking essential questions.', isFavorite: true },
    { title: '1984',                            author: 'George Orwell',            genre: 'Fiction', status: 'read', year: 1949, pages: 328, rating: 5, description: 'A dystopian vision of a totalitarian society under constant surveillance by Big Brother.' },
];

// ================================================================
//  INIT
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadPrefs();
    loadBooks();

    // Seed on first run
    if (books.length === 0) {
        books = SEED_BOOKS.map(b => new Book(b));
        saveBooks();
        setTimeout(() => notify('Welcome to Bibliotheca! 10 sample books loaded. 📚', 'gold'), 600);
    }

    // Apply saved prefs
    applyTheme(prefs.theme);
    if (prefs.filterGenre)  document.getElementById('filterGenre').value  = prefs.filterGenre;
    if (prefs.filterStatus) document.getElementById('filterStatus').value = prefs.filterStatus;
    if (prefs.filterRating) document.getElementById('filterRating').value = prefs.filterRating;
    if (prefs.sortField) {
        sortField = prefs.sortField;
        sortDir   = prefs.sortDir;
        const arrowMap = { title: 'sortTitleArrow', year: 'sortYearArrow', rating: 'sortRatingArrow', pages: 'sortPagesArrow' };
        if (arrowMap[sortField]) document.getElementById(arrowMap[sortField]).textContent = sortDir === 'asc' ? '↑' : '↓';
    }

    applyFiltersAndRender();

    // Auto-save hint using setTimeout
    setTimeout(() => {
        if (books.length > 0) notify('Your library is auto-saved 💾', 'info');
    }, 2000);
});
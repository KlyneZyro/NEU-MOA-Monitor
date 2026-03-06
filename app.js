import { loginWithGoogle, logout, observeAuth, getAllUsers, updateUserRecord } from './auth.js';
import { saveMoa, getAllMoas, getAllMoasAdmin, softDeleteMoa, recoverMoa, getDeletedMoas, getAuditLogs } from './moa-service.js';

// ─── GLOBAL STATE ────────────────────────────────────────────────────────────
let currentUserDetails = null;
let currentUserRole = null;
let currentMaintainAccess = false;
let allMoas = [];        // Active MOAs only — stats, edit, delete, CSV, search
let allMoasAdmin = [];   // All MOAs incl. deleted — admin table display only
let deletedMoas = [];    // Trash view state

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
const loader = document.getElementById('global-loader');

const NAV_MAP = {
    'view-dashboard':      'navbtn-dashboard',
    'view-moa-list':       'navbtn-moa-list',
    'view-audit-trail':    'nav-audit-trail',
    'view-trash':          'nav-trash',
    'view-user-management':'nav-users',
};

window.showView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');

    // Close mobile menu on navigation
    closeMobileMenu();

    // Active nav button state
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeId = NAV_MAP[viewId];
    if (activeId) {
        const btn = document.getElementById(activeId);
        if (btn) btn.classList.add('active');
    }

    // Reset dashboard filters when navigating to dashboard — prevents stale
    // filter state from carrying over after filtering then leaving and returning
    if (viewId === 'view-dashboard') {
        const fc = document.getElementById('filter-college');
        const fd1 = document.getElementById('filter-date-from');
        const fd2 = document.getElementById('filter-date-to');
        if (fc) fc.value = '';
        if (fd1 && fd1._flatpickr) fd1._flatpickr.clear();
        if (fd2 && fd2._flatpickr) fd2._flatpickr.clear();
        if (allMoas.length > 0) updateDashboardStats(allMoas);
    }
};

function toggleLoader(show) {
    show ? loader.classList.remove('hidden') : loader.classList.add('hidden');
}

function canWrite() {
    return currentUserRole === 'admin' || (currentUserRole === 'faculty' && currentMaintainAccess);
}

function emptyRow(colspan, message) {
    return `<tr class="empty-row"><td colspan="${colspan}">${message}</td></tr>`;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Returns expiry date info: computed as effectiveDate + 1 year
// daysLeft used for expiry warning on edit form
function getExpiryInfo(effectiveDateTimestamp) {
    if (!effectiveDateTimestamp) return { dateStr: 'N/A', colorClass: 'expiry-ok', daysLeft: 999 };
    const expiry = new Date(effectiveDateTimestamp.toDate());
    expiry.setFullYear(expiry.getFullYear() + 1);
    const now = new Date();
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    const dateStr = expiry.toLocaleDateString();
    let colorClass = 'expiry-ok';
    if (daysLeft <= 60) colorClass = 'expiry-danger';
    else if (daysLeft <= 180) colorClass = 'expiry-warning';
    return { dateStr, colorClass, daysLeft };
}

// ─── MOBILE NAV ──────────────────────────────────────────────────────────────
function closeMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.add('hidden');
}

// ─── FLATPICKR INITIALIZATION ────────────────────────────────────────────────
// MOA form date picker
flatpickr('#field-effectiveDate', { dateFormat: 'Y-m-d', allowInput: false });

// Dashboard date range filters — onChange re-runs stats immediately
flatpickr('#filter-date-from', {
    dateFormat: 'Y-m-d',
    allowInput: false,
    onChange: () => { if (allMoas.length > 0) updateDashboardStats(allMoas); }
});
flatpickr('#filter-date-to', {
    dateFormat: 'Y-m-d',
    allowInput: false,
    onChange: () => { if (allMoas.length > 0) updateDashboardStats(allMoas); }
});

// ─── AUTH OBSERVER ────────────────────────────────────────────────────────────
observeAuth(async (user, userData) => {
    toggleLoader(true);
    try {
        if (user && userData) {
            currentUserDetails = user;
            currentUserRole = userData.role;
            currentMaintainAccess = userData.maintainAccess || false;

            document.getElementById('main-nav').classList.remove('hidden');
            document.getElementById('user-display-name').textContent = user.displayName;

            // Role badge
            const badgeEl = document.getElementById('user-role-badge');
            badgeEl.className = currentUserRole === 'admin' ? 'role-badge role-badge-admin'
                              : currentUserRole === 'faculty' ? 'role-badge role-badge-faculty'
                              : 'role-badge role-badge-student';
            badgeEl.textContent = userData.role.charAt(0).toUpperCase() + userData.role.slice(1);

            // Student dashboard: hide Processing + Expiring cards, center the single card,
            // rename label to clarify its meaning for students
            const processingCard = document.getElementById('stat-card-processing');
            const expiringCard   = document.getElementById('stat-card-expiring');
            const activeLabel    = document.getElementById('stat-label-active');
            const statGrid       = document.getElementById('stat-cards-grid');
            if (currentUserRole === 'student') {
                if (processingCard) processingCard.classList.add('hidden');
                if (expiringCard)   expiringCard.classList.add('hidden');
                if (activeLabel)    activeLabel.textContent = 'Companies Available for OJT';
                if (statGrid) { statGrid.classList.remove('md:grid-cols-3'); statGrid.classList.add('max-w-sm'); }
            } else {
                if (processingCard) processingCard.classList.remove('hidden');
                if (expiringCard)   expiringCard.classList.remove('hidden');
                if (activeLabel)    activeLabel.textContent = 'Active MOAs';
                if (statGrid) { statGrid.classList.add('md:grid-cols-3'); statGrid.classList.remove('max-w-sm'); }
            }

            // Role-gated nav: always reset to hidden first, then selectively show
            ['nav-audit-trail','nav-trash','nav-users',
             'mobile-nav-audit-trail','mobile-nav-trash','mobile-nav-users'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('nav-hidden');
            });
            if (currentUserRole === 'admin') {
                ['nav-audit-trail','nav-trash','nav-users',
                 'mobile-nav-audit-trail','mobile-nav-trash','mobile-nav-users'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.remove('nav-hidden');
                });
            }

            // Role-gated buttons
            const btnAdd = document.getElementById('btn-open-add-moa');
            canWrite() ? btnAdd.classList.remove('hidden') : btnAdd.classList.add('hidden');

            const btnExport = document.getElementById('btn-export-csv');
            currentUserRole !== 'student' ? btnExport.classList.remove('hidden') : btnExport.classList.add('hidden');

            // Hide filter bar for students
            const filterBox = document.getElementById('dashboard-filters');
            if (filterBox) {
                currentUserRole === 'student' ? filterBox.classList.add('hidden') : filterBox.classList.remove('hidden');
            }

            // Always reset filters on login — prevents stale cross-session filter state
            document.getElementById('filter-college').value = '';
            const fd1 = document.getElementById('filter-date-from');
            const fd2 = document.getElementById('filter-date-to');
            if (fd1._flatpickr) fd1._flatpickr.clear();
            if (fd2._flatpickr) fd2._flatpickr.clear();

            showView('view-dashboard');
            await loadMoaTable();

        } else {
            document.getElementById('main-nav').classList.add('hidden');
            showView('view-login');
        }
    } catch (e) {
        console.error('Auth observer error:', e);
    } finally {
        toggleLoader(false);
    }
});

// ─── DASHBOARD FILTER HELPERS ────────────────────────────────────────────────

// Populates College dropdown from live active MOA data
function populateDashboardFilters(moas) {
    const colleges = [...new Set(moas.map(m => m.endorsedByCollege).filter(Boolean))].sort();
    const collegeSelect = document.getElementById('filter-college');
    const prevCollege = collegeSelect.value;
    collegeSelect.innerHTML = '<option value="">All Colleges</option>';
    colleges.forEach(c => {
        collegeSelect.innerHTML += `<option value="${escapeHtml(c)}" ${prevCollege === c ? 'selected' : ''}>${escapeHtml(c)}</option>`;
    });
}

// Re-calculates stat card numbers based on college + date range filters
function updateDashboardStats(moas) {
    const collegeFilter = document.getElementById('filter-college').value;
    const dateFromStr   = document.getElementById('filter-date-from').value;
    const dateToStr     = document.getElementById('filter-date-to').value;
    const dateFrom = dateFromStr ? new Date(dateFromStr) : null;
    const dateTo   = dateToStr  ? new Date(dateToStr + 'T23:59:59') : null; // include full end day

    let filtered = [...moas];
    if (collegeFilter) filtered = filtered.filter(m => m.endorsedByCollege === collegeFilter);
    if (dateFrom || dateTo) {
        filtered = filtered.filter(m => {
            if (!m.effectiveDate) return false;
            const d = m.effectiveDate.toDate();
            if (dateFrom && d < dateFrom) return false;
            if (dateTo   && d > dateTo)   return false;
            return true;
        });
    }

    const activeCount = filtered.filter(m => m.status.startsWith('APPROVED')).length;
    let processingCount = 0;
    let expiringCount   = 0;
    if (currentUserRole !== 'student') {
        processingCount = filtered.filter(m => m.status.startsWith('PROCESSING')).length;
        expiringCount   = filtered.filter(m => m.status.startsWith('EXPIRING') || m.status.startsWith('EXPIRED')).length;
    }
    document.getElementById('stat-active').textContent     = activeCount;
    document.getElementById('stat-processing').textContent = processingCount;
    document.getElementById('stat-expiring').textContent   = expiringCount;
}

// ─── LOAD MOA TABLE ───────────────────────────────────────────────────────────
async function loadMoaTable() {
    try {
        allMoas = await getAllMoas(); // active only — always fetched for all roles

        // Admin also fetches all (incl. deleted) for the main list display (req #11)
        if (currentUserRole === 'admin') {
            allMoasAdmin = await getAllMoasAdmin();
        }

        populateDashboardFilters(allMoas);
        updateDashboardStats(allMoas);

        const thead      = document.getElementById('table-headers');
        const tbody      = document.getElementById('moa-table-body');
        const recordCount = document.getElementById('record-count');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        // ── STUDENT VIEW ──────────────────────────────────────────────────────
        if (currentUserRole === 'student') {
            thead.innerHTML = `
                <th>Company Name</th>
                <th>Address</th>
                <th>Contact Person</th>
                <th>Email Address</th>
            `;
            const visible = allMoas.filter(m => m.status.startsWith('APPROVED'));
            if (recordCount) recordCount.textContent = `Showing ${visible.length} approved MOA${visible.length !== 1 ? 's' : ''}`;
            if (visible.length === 0) {
                tbody.innerHTML = emptyRow(4, 'No approved MOAs available.');
                return;
            }
            visible.forEach(moa => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="font-semibold text-neu-blue">${escapeHtml(moa.companyName)}</td>
                    <td class="text-gray-500">${escapeHtml(moa.companyAddress)}</td>
                    <td>${escapeHtml(moa.contactPerson)}</td>
                    <td class="text-blue-600">${escapeHtml(moa.contactEmail)}</td>
                `;
                tbody.appendChild(tr);
            });

        // ── ADMIN / FACULTY VIEW ──────────────────────────────────────────────
        } else {
            // Admin sees all rows (active + deleted); faculty sees active only
            const displayMoas = currentUserRole === 'admin' ? allMoasAdmin : allMoas;
            const colCount = canWrite() ? 8 : 7;
            const actionHeader = canWrite() ? '<th class="text-center">Actions</th>' : '';
            thead.innerHTML = `
                <th>HTE ID</th>
                <th>Company Name</th>
                <th>Contact Person</th>
                <th>Industry</th>
                <th>Effective Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
                ${actionHeader}
            `;

            if (recordCount) {
                const deletedCount = displayMoas.filter(m => m.isDeleted).length;
                recordCount.textContent = currentUserRole === 'admin'
                    ? `Showing ${displayMoas.length} record${displayMoas.length !== 1 ? 's' : ''} — ${allMoas.length} active, ${deletedCount} deleted`
                    : `Showing ${displayMoas.length} MOA record${displayMoas.length !== 1 ? 's' : ''}`;
            }

            if (displayMoas.length === 0) {
                tbody.innerHTML = emptyRow(colCount, 'No MOA records found.');
                return;
            }

            displayMoas.forEach(moa => {
                const tr = document.createElement('tr');
                const isDeleted = moa.isDeleted === true;

                // Deleted rows get a visual strikethrough style (req #11)
                if (isDeleted) tr.classList.add('row-deleted');

                const dateStr = moa.effectiveDate ? moa.effectiveDate.toDate().toLocaleDateString() : 'N/A';
                const expiry  = getExpiryInfo(moa.effectiveDate);

                const statusBadge = moa.status.startsWith('APPROVED')
                    ? `<span class="badge badge-approved">${escapeHtml(moa.status.split(':')[0])}</span>`
                    : moa.status.startsWith('PROCESSING')
                    ? `<span class="badge badge-processing">${escapeHtml(moa.status.split(':')[0])}</span>`
                    : `<span class="badge badge-expired">${escapeHtml(moa.status.split(':')[0])}</span>`;

                let actionCell = '';
                if (canWrite()) {
                    // Deleted rows: no edit/delete — admin recovers them via Trash view
                    actionCell = isDeleted
                        ? `<td class="text-center"><span class="badge badge-deleted">Deleted — recover via Trash</span></td>`
                        : `<td class="text-center" style="white-space:nowrap">
                               <button onclick="editMoa('${moa.id}')" class="btn-edit">Edit</button>
                               <button onclick="deleteMoa('${moa.id}')" class="btn-delete" style="margin-left:6px">Delete</button>
                           </td>`;
                }

                tr.innerHTML = `
                    <td class="text-gray-400 text-xs font-mono">${escapeHtml(moa.hteId)}</td>
                    <td class="font-semibold text-neu-blue">
                        ${escapeHtml(moa.companyName)}
                        ${isDeleted ? '<span class="badge badge-deleted" style="margin-left:6px;vertical-align:middle">Deleted</span>' : ''}
                    </td>
                    <td>
                        <div class="font-medium">${escapeHtml(moa.contactPerson)}</div>
                        <div class="text-xs text-blue-500 mt-0.5">${escapeHtml(moa.contactEmail)}</div>
                    </td>
                    <td class="text-gray-500">${escapeHtml(moa.industryType)}</td>
                    <td class="text-gray-500">${dateStr}</td>
                    <td class="${expiry.colorClass}">${expiry.dateStr}</td>
                    <td>${statusBadge}</td>
                    ${actionCell}
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Failed to load MOA records. Please refresh and try again.', 'error');
    }
}

// ─── FIELD-AWARE SEARCH ───────────────────────────────────────────────────────
// Searches specific MOA fields — more reliable than generic textContent sweep
// Works for both student (4 cols) and admin/faculty (7-8 cols) layouts
function applySearch(term) {
    const rows = document.querySelectorAll('#moa-table-body tr');
    const t = term.toLowerCase().trim();
    rows.forEach(row => {
        if (row.classList.contains('empty-row')) return;
        // Use full textContent — covers all visible columns: company, address,
        // contact, email, industry, college (from status/badge text), expiry, status
        const text = row.textContent.toLowerCase();
        row.style.display = (!t || text.includes(t)) ? '' : 'none';
    });
}

// ─── MOA EDIT ────────────────────────────────────────────────────────────────
window.editMoa = function(id) {
    if (!canWrite()) {
        Swal.fire('Access Denied', 'You do not have permission to edit MOAs.', 'error');
        return;
    }
    const moa = allMoas.find(m => m.id === id);
    if (!moa) return;

    // Expiry warning: alert admin/faculty if they open an already-expired MOA
    const expiry = getExpiryInfo(moa.effectiveDate);
    if (expiry.daysLeft <= 0) {
        Swal.fire({
            icon: 'warning',
            title: 'MOA Has Expired',
            text: `This MOA expired on ${expiry.dateStr}. Consider updating the status to "EXPIRED: No renewal done".`,
            confirmButtonColor: '#0a2d5e'
        });
    }

    document.getElementById('form-moa-id').value = moa.id;
    document.getElementById('field-hteId').value = moa.hteId;
    document.getElementById('field-companyName').value = moa.companyName;
    document.getElementById('field-address').value = moa.companyAddress;
    document.getElementById('field-contactPerson').value = moa.contactPerson;
    document.getElementById('field-contactEmail').value = moa.contactEmail;
    document.getElementById('field-industryType').value = moa.industryType;
    document.getElementById('field-college').value = moa.endorsedByCollege;

    const dateStr = moa.effectiveDate
        ? new Date(moa.effectiveDate.toMillis()).toISOString().split('T')[0]
        : '';
    document.getElementById('field-effectiveDate')._flatpickr.setDate(dateStr);
    document.getElementById('field-status').value = moa.status;
    document.getElementById('form-title').textContent = 'Edit MOA';
    showView('view-moa-form');
};

// ─── MOA DELETE ──────────────────────────────────────────────────────────────
window.deleteMoa = async function(id) {
    if (!canWrite()) {
        Swal.fire('Access Denied', 'You do not have permission to delete MOAs.', 'error');
        return;
    }
    const moa = allMoas.find(m => m.id === id);
    if (!moa) return;

    const result = await Swal.fire({
        title: 'Delete this MOA?',
        text: `"${moa.companyName}" will be moved to Trash.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    });
    if (!result.isConfirmed) return;

    toggleLoader(true);
    try {
        await softDeleteMoa(id, moa.companyName, currentUserDetails);
        Swal.fire('Deleted!', 'MOA has been moved to Trash.', 'success');
        await loadMoaTable();
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        toggleLoader(false);
    }
};

// ─── TRASH VIEW ───────────────────────────────────────────────────────────────
window.loadTrashView = async function() {
    if (currentUserRole !== 'admin') {
        Swal.fire('Access Denied', 'Only admins can access the Trash.', 'error');
        return;
    }
    showView('view-trash');
    toggleLoader(true);
    try {
        deletedMoas = await getDeletedMoas();
        const tbody = document.getElementById('trash-table-body');
        tbody.innerHTML = '';
        if (deletedMoas.length === 0) {
            tbody.innerHTML = emptyRow(6, 'Trash is empty. No deleted MOAs.');
            return;
        }
        deletedMoas.forEach(moa => {
            const statusBadge = moa.status.startsWith('APPROVED')
                ? `<span class="badge badge-approved">${escapeHtml(moa.status.split(':')[0])}</span>`
                : moa.status.startsWith('PROCESSING')
                ? `<span class="badge badge-processing">${escapeHtml(moa.status.split(':')[0])}</span>`
                : `<span class="badge badge-expired">${escapeHtml(moa.status.split(':')[0])}</span>`;
            tbody.innerHTML += `
                <tr>
                    <td class="text-gray-400 text-xs font-mono">${escapeHtml(moa.hteId)}</td>
                    <td class="font-semibold text-neu-blue">${escapeHtml(moa.companyName)}</td>
                    <td>${escapeHtml(moa.contactPerson)}</td>
                    <td class="text-gray-500">${escapeHtml(moa.industryType)}</td>
                    <td>${statusBadge}</td>
                    <td class="text-center">
                        <button onclick="recoverMoaItem('${moa.id}')" class="btn-recover">Recover</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Failed to load Trash. Please try again.', 'error');
    } finally {
        toggleLoader(false);
    }
};

window.recoverMoaItem = async function(id) {
    const moa = deletedMoas.find(m => m.id === id);
    if (!moa) return;

    const result = await Swal.fire({
        title: 'Recover this MOA?',
        text: `"${moa.companyName}" will be restored to the active registry.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#16a34a',
        confirmButtonText: 'Yes, recover it!'
    });
    if (!result.isConfirmed) return;

    toggleLoader(true);
    try {
        await recoverMoa(id, moa.companyName, currentUserDetails);
        Swal.fire('Recovered!', `"${moa.companyName}" has been restored.`, 'success');
        // Sequential: loadMoaTable first (updates allMoas), then loadTrashView (re-renders trash)
        // NOT Promise.all — loadTrashView has its own toggleLoader(false) which would fire too early
        await loadMoaTable();
        await loadTrashView();
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        toggleLoader(false);
    }
};

// ─── EXPORT TO CSV ────────────────────────────────────────────────────────────
window.exportToCSV = function() {
    if (allMoas.length === 0) {
        Swal.fire('No Data', 'There are no active MOA records to export.', 'info');
        return;
    }
    const headers = ['HTE ID','Company Name','Company Address','Contact Person','Contact Email','Industry','College','Effective Date','Expiry Date','Status'];
    const escape = val => `"${(val || '').toString().replace(/"/g, '""')}"`;
    const rows = allMoas.map(moa => {
        const dateStr = moa.effectiveDate ? moa.effectiveDate.toDate().toLocaleDateString() : 'N/A';
        const expiry  = getExpiryInfo(moa.effectiveDate);
        return [moa.hteId, moa.companyName, moa.companyAddress, moa.contactPerson, moa.contactEmail,
                moa.industryType, moa.endorsedByCollege, dateStr, expiry.dateStr, moa.status].map(escape).join(',');
    });
    const csv  = [headers.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `NEU_MOA_Export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Swal.fire({ icon: 'success', title: 'Export Complete', text: 'CSV file downloaded.', timer: 2000, showConfirmButton: false });
};

// ─── AUDIT TRAIL ─────────────────────────────────────────────────────────────
window.loadAuditView = async function() {
    if (currentUserRole !== 'admin') {
        Swal.fire('Access Denied', 'You do not have permission to view the audit trail.', 'error');
        return;
    }
    showView('view-audit-trail');
    toggleLoader(true);
    try {
        const logs = await getAuditLogs();
        const tbody = document.getElementById('audit-table-body');
        tbody.innerHTML = '';
        if (logs.length === 0) {
            tbody.innerHTML = emptyRow(4, 'No audit logs found.');
            return;
        }
        logs.forEach(log => {
            const dateStr = log.timestamp ? log.timestamp.toDate().toLocaleString() : 'N/A';
            const actionClass = log.action === 'Soft-Delete' ? 'action-delete'
                              : log.action === 'Insert'      ? 'action-insert'
                              : log.action === 'Recover'     ? 'action-recover'
                              : 'action-edit';
            tbody.innerHTML += `
                <tr>
                    <td class="text-gray-400 text-xs">${dateStr}</td>
                    <td class="font-semibold">${escapeHtml(log.userName)}</td>
                    <td class="${actionClass}">${escapeHtml(log.action)}</td>
                    <td>${escapeHtml(log.companyName)}</td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Failed to load audit logs. Please try again.', 'error');
    } finally {
        toggleLoader(false);
    }
};

// ─── USER MANAGEMENT ──────────────────────────────────────────────────────────
window.loadUserView = async function() {
    if (currentUserRole !== 'admin') {
        Swal.fire('Access Denied', 'You do not have permission to manage users.', 'error');
        return;
    }
    showView('view-user-management');
    toggleLoader(true);
    try {
        const users = await getAllUsers();
        const tbody = document.getElementById('user-table-body');
        tbody.innerHTML = '';
        if (users.length === 0) {
            tbody.innerHTML = emptyRow(5, 'No users found.'); // 5 columns now
            return;
        }
        users.forEach(u => {
            const isSelf    = u.uid === currentUserDetails.uid;
            const isBlocked = u.isBlocked || false;
            const initials  = (u.displayName || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

            // Block/Unblock button — disabled for self (can't block yourself)
            const blockBtn = isSelf
                ? '<span class="text-xs text-gray-400 italic">—</span>'
                : `<button onclick="toggleBlockUser('${u.id}', ${isBlocked})"
                           class="${isBlocked ? 'btn-unblock' : 'btn-block'}">
                       ${isBlocked ? 'Unblock' : 'Block'}
                   </button>`;

            tbody.innerHTML += `
                <tr class="${isBlocked ? 'row-blocked' : ''}">
                    <td>
                        <div class="flex items-center gap-3">
                            <div class="user-avatar">${initials}</div>
                            <div>
                                <span class="font-semibold text-neu-blue">${escapeHtml(u.displayName)}</span>
                                ${isSelf    ? '<span class="badge badge-approved" style="font-size:0.6rem;margin-left:4px">You</span>' : ''}
                                ${isBlocked ? '<span class="badge badge-expired"  style="font-size:0.6rem;margin-left:4px">Blocked</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td class="text-gray-500">${escapeHtml(u.email)}</td>
                    <td>
                        <select onchange="changeUserRole('${u.id}', this.value)"
                                ${isSelf ? 'disabled' : ''} class="role-select">
                            <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
                            <option value="faculty" ${u.role === 'faculty' ? 'selected' : ''}>Faculty</option>
                            <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>Admin</option>
                        </select>
                    </td>
                    <td class="text-center">
                        <input type="checkbox"
                               onchange="toggleMaintainAccess('${u.id}', this.checked)"
                               ${u.role !== 'faculty' ? 'disabled' : ''}
                               ${u.maintainAccess ? 'checked' : ''}
                               class="w-4 h-4 accent-neu-blue cursor-pointer">
                    </td>
                    <td class="text-center">${blockBtn}</td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Failed to load users. Please try again.', 'error');
    } finally {
        toggleLoader(false);
    }
};

// Role change: confirms first, warns that maintainAccess will be revoked
window.changeUserRole = async function(userId, newRole) {
    if (currentUserRole !== 'admin') return;
    const result = await Swal.fire({
        title: 'Change User Role?',
        text: 'This will also revoke their MOA edit access. Continue?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0a2d5e',
        confirmButtonText: 'Yes, change role'
    });
    if (!result.isConfirmed) {
        // Reload to reset the dropdown back to original value
        await loadUserView();
        return;
    }
    toggleLoader(true);
    try {
        await updateUserRecord(userId, { role: newRole, maintainAccess: false });
        Swal.fire({ icon: 'success', title: 'Role Updated', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        await loadUserView();
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    } finally {
        toggleLoader(false);
    }
};

window.toggleMaintainAccess = async function(userId, hasAccess) {
    if (currentUserRole !== 'admin') return;
    toggleLoader(true);
    try {
        await updateUserRecord(userId, { maintainAccess: hasAccess });
        Swal.fire({ icon: 'success', title: 'Access Updated', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    } finally {
        toggleLoader(false);
    }
};

// Block / Unblock user — toggles isBlocked in Firestore; enforced at login in auth.js
window.toggleBlockUser = async function(userId, isCurrentlyBlocked) {
    if (currentUserRole !== 'admin') return;
    const action = isCurrentlyBlocked ? 'unblock' : 'block';
    const result = await Swal.fire({
        title: `${isCurrentlyBlocked ? 'Unblock' : 'Block'} this user?`,
        text: isCurrentlyBlocked
            ? 'This user will regain access to the system.'
            : 'This user will be prevented from logging in.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isCurrentlyBlocked ? '#16a34a' : '#dc2626',
        confirmButtonText: `Yes, ${action} them`
    });
    if (!result.isConfirmed) return;
    toggleLoader(true);
    try {
        await updateUserRecord(userId, { isBlocked: !isCurrentlyBlocked });
        Swal.fire({
            icon: 'success',
            title: isCurrentlyBlocked ? 'User Unblocked' : 'User Blocked',
            toast: true, position: 'top-end', timer: 2000, showConfirmButton: false
        });
        await loadUserView();
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    } finally {
        toggleLoader(false);
    }
};

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────

// Login
document.getElementById('btn-google-login').addEventListener('click', async () => {
    toggleLoader(true);
    try {
        await loginWithGoogle();
        Swal.fire({ icon: 'success', title: 'Welcome!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    } catch (error) {
        Swal.fire('Login Failed', error.message, 'error');
    } finally {
        toggleLoader(false);
    }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
    const result = await Swal.fire({
        title: 'Sign out?',
        text: 'Are you sure you want to log out?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0a2d5e',
        confirmButtonText: 'Yes, log out'
    });
    if (result.isConfirmed) logout();
});

// Open Add MOA form
document.getElementById('btn-open-add-moa')?.addEventListener('click', () => {
    document.getElementById('moa-form').reset();
    document.getElementById('form-moa-id').value = '';
    document.getElementById('field-effectiveDate')._flatpickr.clear();
    document.getElementById('form-title').textContent = 'Add New MOA';
    showView('view-moa-form');
});

// MOA form submit: duplicate HTE ID check, date validation, save
document.getElementById('moa-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawDate = document.getElementById('field-effectiveDate').value;
    if (!rawDate) {
        Swal.fire('Missing Date', 'Please select an Effective Date before saving.', 'warning');
        return;
    }

    const moaId = document.getElementById('form-moa-id').value;
    const hteId = document.getElementById('field-hteId').value.trim();

    // Duplicate HTE ID check — warns but allows override
    const duplicate = allMoas.find(m => m.hteId === hteId && m.id !== moaId);
    if (duplicate) {
        const confirm = await Swal.fire({
            title: 'Duplicate HTE ID',
            html: `HTE ID <strong>${escapeHtml(hteId)}</strong> is already used by <strong>${escapeHtml(duplicate.companyName)}</strong>.<br>Save anyway?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d97706',
            confirmButtonText: 'Save Anyway',
            cancelButtonText: 'Cancel'
        });
        if (!confirm.isConfirmed) return;
    }

    toggleLoader(true);
    const moaData = {
        hteId,
        companyName:      document.getElementById('field-companyName').value,
        companyAddress:   document.getElementById('field-address').value,
        contactPerson:    document.getElementById('field-contactPerson').value,
        contactEmail:     document.getElementById('field-contactEmail').value,
        industryType:     document.getElementById('field-industryType').value,
        endorsedByCollege:document.getElementById('field-college').value,
        effectiveDate:    rawDate,
        status:           document.getElementById('field-status').value,
    };
    try {
        await saveMoa(moaData, moaId || null, currentUserDetails);
        Swal.fire({ icon: 'success', title: 'Saved!', text: 'MOA record saved.', timer: 2000, showConfirmButton: false });
        showView('view-moa-list');
        await loadMoaTable();
    } catch (error) {
        Swal.fire('Error', 'Could not save MOA. ' + error.message, 'error');
    } finally {
        toggleLoader(false);
    }
});

// Search bar — field-aware
document.getElementById('search-moa').addEventListener('input', (e) => {
    applySearch(e.target.value);
});

// Dashboard college filter
document.getElementById('filter-college').addEventListener('change', () => updateDashboardStats(allMoas));

// Hamburger mobile nav toggle
document.getElementById('hamburger-btn')?.addEventListener('click', () => {
    const menu = document.getElementById('mobile-menu');
    if (menu) menu.classList.toggle('hidden');
});

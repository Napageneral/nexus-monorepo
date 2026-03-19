# Phase 6: Server Creation UI

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** Phase 3 (provisioning flow — API must exist), Phase 2 (plan list)
**Enables:** End-to-end user experience
**Specs:** [CLOUD_PROVISIONING_ARCHITECTURE §7.1](../specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md), [CRITICAL_CUSTOMER_FLOWS F5](../specs/CRITICAL_CUSTOMER_FLOWS_2026-03-02.md)

---

## Goal

Replace the current "New Server" button (which fires immediately with no options) with a modal that lets users choose a server name and plan size. Show provisioning progress and server details.

---

## Current State

- "New Server" button calls `/api/entry/execute` with no options
- Gets stuck on "Creating..." for 90+ seconds (blocking call)
- No plan or size selection
- No provisioning progress UI (just a frozen button)
- Server detail view has no plan/cost info

---

## Tasks

### 6.1 — Server creation modal

**File:** `public/index.html`

Replace the "New Server" button click handler with a modal:

```html
<div id="create-server-modal" class="modal-overlay hidden">
  <div class="modal-box">
    <h3>Create Server</h3>

    <!-- Server name -->
    <label>Server name (optional)</label>
    <input type="text" id="server-name-input"
           placeholder="Auto-generated if empty" />

    <!-- Plan selection -->
    <label>Server size</label>
    <div id="plan-options" class="plan-grid">
      <!-- Populated by renderPlanOptions() -->
    </div>

    <!-- Action -->
    <div class="modal-actions">
      <button id="create-server-btn" onclick="submitCreateServer()">
        Create Server
      </button>
      <button class="secondary" onclick="hideCreateServerModal()">
        Cancel
      </button>
    </div>
  </div>
</div>
```

### 6.2 — Plan selection cards

```javascript
async function renderPlanOptions() {
  const res = await api('/api/plans');
  const { plans } = await res.json();
  const container = document.getElementById('plan-options');

  container.innerHTML = plans.map((plan, i) => `
    <label class="plan-card ${i === 0 ? 'selected' : ''}">
      <input type="radio" name="plan" value="${plan.id}"
             ${i === 0 ? 'checked' : ''} />
      <div class="plan-card-content">
        <strong>${plan.displayName}</strong>
        <span class="plan-specs">${plan.vcpus} vCPU · ${Math.round(plan.memoryMb / 1024)} GB RAM · ${plan.diskGb} GB</span>
        <span class="plan-price">€${(plan.monthlyCostCents / 100).toFixed(2)}/mo</span>
      </div>
    </label>
  `).join('');

  // Handle selection styling
  container.querySelectorAll('input[name="plan"]').forEach(radio => {
    radio.addEventListener('change', () => {
      container.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
      radio.closest('.plan-card').classList.add('selected');
    });
  });
}
```

### 6.3 — CSS for plan cards

```css
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 16px;
}

.plan-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color 0.15s;
}

.plan-card:hover {
  border-color: var(--border-bright);
}

.plan-card.selected {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.05);
}

.plan-card input[type="radio"] {
  display: none;
}

.plan-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plan-specs {
  font-size: 0.85em;
  color: var(--text-muted);
}

.plan-price {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--accent);
}
```

### 6.4 — Submit handler

```javascript
async function submitCreateServer() {
  const btn = document.getElementById('create-server-btn');
  const name = document.getElementById('server-name-input').value.trim();
  const plan = document.querySelector('input[name="plan"]:checked')?.value || 'cax11';

  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const body = { plan };
    if (name) body.display_name = name;

    const res = await api('/api/servers/create', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.ok) {
      alert('Failed to create server: ' + (data.error || 'Unknown error'));
      return;
    }

    // Close modal
    hideCreateServerModal();

    // Start polling for provisioning status
    startProvisionPolling(data.server_id);

    // Navigate to servers view to show the new server provisioning
    showServers();

  } catch (err) {
    console.error('Create server failed:', err);
    alert('Failed to create server. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Server';
  }
}
```

### 6.5 — Provisioning progress polling

```javascript
function startProvisionPolling(serverId) {
  const poll = setInterval(async () => {
    try {
      const res = await api(`/api/servers/${serverId}`);
      const server = await res.json();

      if (server.status === 'running') {
        clearInterval(poll);
        // Re-render server list to show "Ready" state
        showServers();
        // Optional: show a success toast
        showToast('Server is ready!');
      } else if (server.status === 'failed') {
        clearInterval(poll);
        showServers();
        showToast('Server creation failed. Please try again.', 'error');
      }
      // If still "provisioning", keep polling — re-render to update UI
      showServers();
    } catch (err) {
      console.error('Poll failed:', err);
    }
  }, 3000); // Every 3 seconds

  // Timeout after 6 minutes (slightly longer than backend timeout)
  setTimeout(() => clearInterval(poll), 360000);
}
```

### 6.6 — Server card provisioning states

Update `renderServerCard()` to show different states:

```javascript
function renderServerCard(server) {
  let statusBadge = '';
  let actionButtons = '';

  switch (server.status) {
    case 'provisioning':
      statusBadge = '<span class="badge badge-warn">Provisioning...</span>';
      // Show spinner, no action buttons
      break;
    case 'running':
      statusBadge = '<span class="badge badge-ok">Running</span>';
      actionButtons = '<button onclick="selectServer(...)">Open</button>';
      break;
    case 'failed':
      statusBadge = '<span class="badge badge-error">Failed</span>';
      actionButtons = '<button onclick="deleteServer(...)">Remove</button>';
      break;
    case 'deprovisioning':
      statusBadge = '<span class="badge badge-warn">Deleting...</span>';
      break;
  }

  return `
    <div class="card server-card">
      <div class="card-header">
        <h4>${escHtml(server.display_name)}</h4>
        ${statusBadge}
      </div>
      <div class="card-body">
        <span class="server-plan">${getPlanDisplayName(server.plan)}</span>
        <span class="server-url">${server.tenant_id}.nexushub.sh</span>
      </div>
      <div class="card-actions">
        ${actionButtons}
      </div>
    </div>
  `;
}
```

### 6.7 — Server detail updates

Add plan/cost info and tenant URL to server detail view:

```javascript
function renderServerDetail(server) {
  // ... existing content ...

  // Add new info:
  const planInfo = getPlanDetails(server.plan);
  const tenantUrl = `${server.tenant_id}.nexushub.sh`;

  // Show plan info section
  const planSection = `
    <div class="detail-section">
      <h4>Server Info</h4>
      <div class="detail-row">
        <span class="detail-label">Plan</span>
        <span>${planInfo.displayName} (${planInfo.vcpus} vCPU, ${Math.round(planInfo.memoryMb/1024)} GB RAM)</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Cost</span>
        <span>€${(planInfo.monthlyCostCents / 100).toFixed(2)}/mo</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">URL</span>
        <span><code>https://${tenantUrl}</code></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span>${server.status}</span>
      </div>
    </div>
  `;
}
```

### 6.8 — Helper: plan details lookup

```javascript
const PLANS = {
  cax11: { displayName: 'Starter', vcpus: 2, memoryMb: 4096, diskGb: 40, monthlyCostCents: 329 },
  cax21: { displayName: 'Standard', vcpus: 4, memoryMb: 8192, diskGb: 80, monthlyCostCents: 549 },
  cax31: { displayName: 'Performance', vcpus: 8, memoryMb: 16384, diskGb: 160, monthlyCostCents: 949 },
};

function getPlanDetails(planId) {
  return PLANS[planId] || { displayName: planId, vcpus: 0, memoryMb: 0, diskGb: 0, monthlyCostCents: 0 };
}

function getPlanDisplayName(planId) {
  return PLANS[planId]?.displayName || planId;
}
```

---

## Verification

- [ ] "New Server" opens modal with name input and plan cards
- [ ] Plan cards show correct specs and pricing
- [ ] Default plan is Starter (cax11)
- [ ] Clicking "Create Server" calls `POST /api/servers/create` with plan
- [ ] Modal closes, server appears in list with "Provisioning..." badge
- [ ] Poll updates UI when status changes to "running"
- [ ] Failed servers show error state with "Remove" option
- [ ] Server detail shows plan, cost, and tenant URL

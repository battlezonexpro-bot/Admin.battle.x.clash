import * as fb from './firebase.js';

const loginScreen = document.getElementById('login-screen');
const dashScreen = document.getElementById('dashboard-screen');
const matchesList = document.getElementById('matches-list');
let currentStaff = null;
let globalMatches = [];
let searchQuery = '';
let currentTab = 'Upcoming';
let currentView = 'matches';
let staffCoins = 0;
let staffTotalEarnings = 0;
let staffRoomsHosted = 0;

const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderMatches();
  });
}

// Handle Login
function doLogin(user, pass) {
  const btn = document.getElementById('login-btn');
  if(btn) { btn.innerHTML = 'Verifying...'; btn.disabled = true; }

  const unsubscribe = fb.listenStaff(staffList => {
    unsubscribe(); 
    
    const staff = staffList.find(s => s.username === user && s.password === pass);
    if (staff) {
      if (staff.isBanned) {
        alert('Your account has been banned by the Admin.');
        localStorage.removeItem('staff_user');
        localStorage.removeItem('staff_pass');
        if(btn) { btn.innerHTML = 'Login'; btn.disabled = false; }
        return;
      }
      currentStaff = staff;
      // Save credentials for auto-login
      localStorage.setItem('staff_user', user);
      localStorage.setItem('staff_pass', pass);
      
      const displayElem = document.getElementById('staff-name-display');
      if(displayElem) displayElem.innerHTML = `<b>@${staff.username}</b>`;
      loginScreen.classList.remove('active');
      loginScreen.style.display = 'none';
      dashScreen.style.display = 'block';
      initDashboard();
    } else {
      alert('Invalid Username or Password!');
      localStorage.removeItem('staff_user');
      localStorage.removeItem('staff_pass');
    }
    if(btn) { btn.innerHTML = 'Login'; btn.disabled = false; }
  });
}

document.getElementById('login-form').onsubmit = (e) => {
  e.preventDefault();
  const user = document.getElementById('login-user').value.toLowerCase().trim();
  const pass = document.getElementById('login-pass').value;
  doLogin(user, pass);
};

// Auto Login Check
window.onload = () => {
  const savedUser = localStorage.getItem('staff_user');
  const savedPass = localStorage.getItem('staff_pass');
  if(savedUser && savedPass) {
    document.getElementById('login-user').value = savedUser;
    document.getElementById('login-pass').value = savedPass;
    doLogin(savedUser, savedPass);
  }
};

window.logoutStaff = () => {
  localStorage.removeItem('staff_user');
  localStorage.removeItem('staff_pass');
  location.reload();
};

function initDashboard() {
  // Listen to matches
  fb.listenMatches(matches => {
    const isFormatMatch = (m) => !currentStaff.assignedFormat || currentStaff.assignedFormat === 'all' || m.matchFormat === currentStaff.assignedFormat;
    
    globalMatches = matches.filter(m => isFormatMatch(m));
    globalMatches.sort((a, b) => {
      const tA = a.schedule || a.matchTime || a.time || a.createdAt;
      const tB = b.schedule || b.matchTime || b.time || b.createdAt;
      const dA = new Date(tA || 0).getTime();
      const dB = new Date(tB || 0).getTime();
      return dA - dB; // ascending (earliest matches first)
    });
    renderMatches();
    if (typeof renderPenalties === 'function') renderPenalties();
  });

  // Listen to Staff's real-time earnings data
  fb.listenStaff(staffs => {
    const me = staffs.find(s => s.username === currentStaff.username);
    if(me) {
      staffCoins = me.balance || 0;
      staffTotalEarnings = me.totalEarned || 0;
      staffRoomsHosted = me.hostedCount || 0;
      
      document.getElementById('e-rooms').innerText = staffRoomsHosted;
      document.getElementById('e-total').innerText = staffTotalEarnings;
      document.getElementById('e-balance').innerText = staffCoins;
      currentStaff = me;
    }
  });
}

window.switchTab = (tab) => {
  currentTab = tab;
  document.querySelectorAll('.match-tab').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  renderMatches();
};

window.switchView = (view) => {
  currentView = view;
  document.querySelectorAll('.screen-view').forEach(el => el.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  event.currentTarget.classList.add('active');
  
  document.getElementById('sidebar').classList.remove('open');
};

document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

function renderMatches() {
  let displayMatches = globalMatches.filter(m => {
    if(currentTab === 'Completed') {
      return (m.status === 'Resulted' || m.status === 'Cancelled' || m.status === 'Completed') && m.roomHostedBy === currentStaff.username;
    }
    return m.status === currentTab || m.status === currentTab.toLowerCase() || m.status === (currentTab === 'Ongoing' ? 'live' : '');
  });
  
  if (searchQuery) {
    displayMatches = displayMatches.filter(m => 
      (m.title && m.title.toLowerCase().includes(searchQuery)) ||
      (m.id && m.id.toLowerCase().includes(searchQuery)) ||
      (m.matchId && m.matchId.toLowerCase().includes(searchQuery))
    );
  }

  if (displayMatches.length === 0) {
    matchesList.innerHTML = '<tr><td colspan="9" class="text-center py-4">No matching records found for ' + currentTab + '</td></tr>';
    updateNextMatchBanner();
    return;
  }
  
  matchesList.innerHTML = '';
  displayMatches.forEach(m => {
    const tr = document.createElement('tr');
    
    let selectHtml = `<span class="badge" style="background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:4px; font-size:12px;">${m.status}</span>`;

    let playersStr = (m.joinedIGNs || []).filter(ign => ign && ign.trim() !== "").join('\\n') || 'No players joined yet.';

    // Fix Match ID
    let displayId = m.matchId || m.id;
    let matchTypeDetails = `${m.gameName || 'Game'} | ${m.map || m.matchType || 'Classic'}`;
    
    // Format Time
    let timeStr = m.schedule || m.matchTime || m.time || 'N/A';
    if(timeStr !== 'N/A') {
      try {
        let d = new Date(timeStr);
        if(!isNaN(d)) {
          let hrs = d.getHours();
          let mins = d.getMinutes().toString().padStart(2, '0');
          let ampm = hrs >= 12 ? 'PM' : 'AM';
          hrs = hrs % 12;
          hrs = hrs ? hrs : 12;
          timeStr = `${d.getDate()}/${d.getMonth()+1} - ${hrs}:${mins} ${ampm}`;
        }
      } catch(e) {}
    }

    let isLocked = false;
    let lockMsg = '';
    if (m.status === 'Resulted' || m.status === 'Completed' || m.status === 'Cancelled') {
      isLocked = true;
      lockMsg = 'title="Match is already completed. Cannot update details."';
    } else if (m.roomFirstUpdatedTime) {
      let passedMs = Date.now() - m.roomFirstUpdatedTime;
      if (passedMs > 5 * 60 * 1000) {
        isLocked = true;
        lockMsg = 'title="Time limit exceeded (5 mins). Cannot update ID/Pass anymore."';
      }
    }

    let ridInput = `<input type="text" id="rid-${m.id}" class="room-input" value="${m.roomId || ''}" placeholder="Room ID" ${isLocked ? 'disabled style="background:#f1f5f9; cursor:not-allowed;"' : ''} ${lockMsg}>`;
    let rpassInput = `<input type="text" id="rpass-${m.id}" class="room-input" value="${m.roomPassword || ''}" placeholder="Password" ${isLocked ? 'disabled style="background:#f1f5f9; cursor:not-allowed;"' : ''} ${lockMsg}>`;
    
    let saveBtnHtml = `<div class="icon-btn ${isLocked ? '' : 'primary'}" ${isLocked ? lockMsg : `onclick="updateRoom('${m.id}')"`} id="btn-${m.id}" ${!isLocked ? 'title="Save Room Details"' : ''} ${isLocked ? 'style="opacity:0.5; cursor:not-allowed;"' : ''}>
                         <i class="fas ${isLocked ? 'fa-lock' : 'fa-save'}"></i>
                       </div>`;

    let copyInfoBtn = `<div class="icon-btn" onclick="copyFullInfo('${m.id}')" title="Copy Full Room Details for WhatsApp">
                         <i class="fas fa-share-alt"></i>
                       </div>`;

    let resultBtn = '';
    if (currentStaff.canUpdateResult && (m.status === 'Ongoing' || m.status === 'live' || m.status === 'Upcoming')) {
      resultBtn = `<div class="icon-btn" onclick="openResultModal('${m.id}')" title="Declare Result" style="background:#e8f0fe; color:#1a73e8; border:1px solid #1a73e8;">
                     <i class="fas fa-gavel"></i>
                   </div>`;
    }

    let isChecked = false;
    if (searchQuery && (String(displayId).toLowerCase().includes(searchQuery) || String(m.id).toLowerCase().includes(searchQuery))) {
      isChecked = true;
    }

    tr.innerHTML = `
      <td class="text-center"><input type="checkbox" class="checkbox-custom" ${isChecked ? 'checked' : ''}></td>
      <td style="font-weight:500; color:#3b82f6; white-space:nowrap;">${timeStr}</td>
      <td style="font-weight:600; color:#0f172a;">#${displayId}</td>
      <td style="max-width: 200px;">
        <div style="font-weight:600; color:#111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${m.title || 'Untitled Match'}">${m.title || 'Untitled Match'}</div>
        <div style="font-size:12px; color:#6b7280; font-weight:500;">${matchTypeDetails}</div>
      </td>
      <td>${selectHtml}</td>
      <td>${ridInput}</td>
      <td>${rpassInput}</td>
      <td>
        <div class="action-icons">
          ${saveBtnHtml}
          ${copyInfoBtn}
          ${resultBtn}
        </div>
      </td>
      <td>
        <div class="action-icons">
          <div class="icon-btn" title="View Data Sheet" onclick="openSheet('${m.id}')">
            <i class="fas fa-table"></i>
          </div>
        </div>
      </td>
    `;
    matchesList.appendChild(tr);
  });
  
  updateNextMatchBanner();
}

window.updateRoom = async (mid) => {
  const btn = document.getElementById(`btn-${mid}`);
  const rid = document.getElementById(`rid-${mid}`).value.trim();
  const rpass = document.getElementById(`rpass-${mid}`).value.trim();
  
  if(!rid || !rpass) {
    alert('Please enter both Room ID & Password.');
    return;
  }
  
  const mOld = globalMatches.find(m => m.id === mid);
  if (!mOld) return;

  if (mOld.status === 'Resulted' || mOld.status === 'Completed' || mOld.status === 'Cancelled') {
    alert("Match is already completed. You cannot update Room ID/Password anymore.");
    return;
  }

  if (mOld.roomFirstUpdatedTime) {
    if (Date.now() - mOld.roomFirstUpdatedTime > 5 * 60 * 1000) {
      alert("5 minutes limit is over. You can no longer update Room ID/Password for this match.");
      return;
    }
  }

  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  btn.style.pointerEvents = 'none';
  
  const oldRid = mOld.roomId || '';
  const oldRpass = mOld.roomPassword || '';
  const idPassChanged = (rid !== oldRid) || (rpass !== oldRpass);
  const shouldNotify = (rid || rpass) && (mOld.status === 'Upcoming' || (mOld.status === 'Ongoing' && idPassChanged));

  let dataToUpdate = { roomId: rid, roomPassword: rpass, updatedAt: Date.now() };

  let penaltyApplied = false;
  
  // First time room ID is provided (Lobby gets Hosted), start the 5 minute timer
  if (!mOld.roomFirstUpdatedTime && rid !== '') {
    dataToUpdate.roomFirstUpdatedTime = Date.now();
    
    const targetTime = new Date(mOld.schedule || mOld.matchTime || mOld.time || 0).getTime();
    const currentNow = Date.now();
    if (targetTime > 0 && currentNow > targetTime + (2 * 60 * 1000)) {
      penaltyApplied = true;
      const lateMs = currentNow - targetTime;
      const lateMins = Math.floor(lateMs / 60000);
      dataToUpdate.latePenalty = true;
      dataToUpdate.penaltyReason = `Room ID/Pass was updated ${lateMins} minutes after match time.`;
      dataToUpdate.lateMins = lateMins;
    }
  }

  if (!mOld.roomHostedBy && rid !== '') {
    dataToUpdate.roomHostedBy = currentStaff.username;
  }

  try {
    if (shouldNotify) {
      if (mOld.status === 'Upcoming') dataToUpdate.status = 'Ongoing';
      
      const validPlayers = (mOld.joinedPlayers || []).filter(u => u && u.trim() !== "");
      const matchName = mOld.title || mOld.gameName || 'Your Match';
      const pushTitle = (mOld.status === 'Ongoing') ? `🔄 [${matchName}] ID/Pass Updated!` : `🏆 [${matchName}] is Ready!`;
      const pushMsg = `ID: ${rid || 'N/A'} | PASS: ${rpass || 'N/A'} ⚡ Lobby is now open. Drop in immediately!`;
      
      if (validPlayers.length > 0) {
        fb.sendPush(pushTitle, pushMsg, validPlayers).catch(e => console.error("Push error:", e));
      }
    }

    await fb.updateMatch(mid, dataToUpdate);
    
    if (penaltyApplied) {
      const newBalance = Math.max(0, (staffCoins || 0) - 4);
      await fb.updateStaff(currentStaff.username, { balance: newBalance });
      alert(`Room Details Updated!\n\n⚠️ PENALTY APPLIED ⚠️\n- Match was delayed by ${dataToUpdate.lateMins} minutes\n- 4 Coins have been deducted from your wallet\n- Please be on time next time.`);
    } else {
      alert('Room Details Updated Successfully! (Coins will be credited when Admin declares the match result)');
    }
    
  } catch (err) {
    alert('Failed to update: ' + err.message);
  } finally {
    btn.innerHTML = origHTML;
    btn.style.pointerEvents = 'auto';
  }
};

window.requestWithdrawal = async () => {
  const method = document.getElementById('withdraw-method').value.trim();
  const amt = parseInt(document.getElementById('withdraw-amount').value);
  
  if(!method || isNaN(amt) || amt < 50) {
    return alert('Minimum withdrawal is 50 Coins. Please enter valid details.');
  }
  
  if(amt > staffCoins) {
    return alert(`Insufficient Balance! You only have ${staffCoins} Coins.`);
  }
  
  try {
    // Deduct
    await fb.updateStaff(currentStaff.username, {
      balance: staffCoins - amt
    });
    
    // Create Request
    await fb.createStaffWithdrawal({
      staffUsername: currentStaff.username,
      method: method,
      amount: amt,
      status: 'Pending',
      timestamp: Date.now()
    });
    
    document.getElementById('withdraw-method').value = '';
    document.getElementById('withdraw-amount').value = '';
    alert('Withdrawal Request Submitted Successfully! Admin will process it soon.');
  } catch(e) {
    alert('Error: ' + e.message);
  }
};

window.openSheet = (mid) => {
  try {
    console.log("Opening Sheet for match:", mid);
    const match = globalMatches.find(m => m.id === mid);
    if(!match) {
      alert("Match not found!");
      return;
    }

    const content = document.getElementById('sheet-rows');
    const uids = match.joinedPlayers || [];
    const igns = match.joinedIGNs || [];
    
    // Set match title in header
    const titleEl = document.getElementById('sheet-match-name');
    if(titleEl) {
      const displayId = match.matchNo || (match.matchId ? String(match.matchId).replace(/[^0-9]/g, '').slice(-5) : match.id.substring(0,5).toUpperCase());
      titleEl.innerText = `${match.title || 'Untitled'} - Match #${displayId} Database`;
    }

    if(uids.length === 0) {
      content.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#6b7280;">No data found.</td></tr>`;
    } else {
      let html = '';
      uids.forEach((uid, i) => {
        if(!uid || uid.trim() === '') return;
        const ign = igns[i] || 'Unknown';
        html += `
          <tr>
            <td class="row-number">${i+1}</td>
            <td>${i+1}</td>
            <td>${ign}</td>
            <td style="font-family:monospace; color:#4b5563;">${uid}</td>
            <td style="color:#10b981;">Joined</td>
          </tr>
        `;
      });
      content.innerHTML = html;
    }

    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('players-screen').style.display = 'block';
  } catch (e) {
    alert("Error opening sheet: " + e.message);
  }
};

window.closeSheet = () => {
  document.getElementById('players-screen').style.display = 'none';
  document.getElementById('dashboard-screen').style.display = 'block';
};

window.exportData = (type) => {
  let isPlayersSheet = document.getElementById('players-screen').style.display === 'block';
  let tableSelector = isPlayersSheet ? '.google-sheet-table' : '.table.table-bordered';
  let table = document.querySelector(tableSelector);
  
  if (!table) return;

  let title = isPlayersSheet ? document.getElementById('sheet-match-name').innerText : 'Match Management Data';
  
  let rows = table.querySelectorAll('tr');
  let data = [];
  
  rows.forEach(tr => {
    let rowData = [];
    let cols = tr.querySelectorAll('th, td');
    cols.forEach(td => {
      if (td.querySelector('.action-icons') || td.querySelector('input[type="checkbox"]') || td.classList.contains('row-number')) {
        return; 
      }
      
      let val = '';
      let inputs = td.querySelectorAll('input, select');
      if (inputs.length > 0) {
        val = inputs[0].value || '';
      } else {
        val = td.innerText.trim();
      }
      rowData.push(val);
    });
    if(rowData.length > 0) data.push(rowData);
  });
  
  data = data.filter(r => r.join('').trim() !== '');

  if (type === 'print') {
    let printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>${title}</title>`);
    printWindow.document.write(`<style>
      body { font-family: sans-serif; padding: 20px; }
      h2 { text-align: center; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f3f4f6; }
    </style></head><body>`);
    printWindow.document.write(`<h2>${title}</h2>`);
    
    let html = '<table>';
    data.forEach((r, i) => {
      html += '<tr>';
      r.forEach(c => {
        html += i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`;
      });
      html += '</tr>';
    });
    html += '</table></body></html>';
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  } 
  else if (type === 'csv' || type === 'excel') {
    let csvStr = data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    let ext = type === 'csv' ? 'csv' : 'csv';
    let blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    let url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${title.replace(/ /g, '_')}.${ext}`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  else if (type === 'pdf') {
    alert('For PDF, please click Print and select "Save as PDF" as your printer.');
    exportData('print');
  }
  else if (type === 'copy') {
    let textStr = data.map(r => r.join('\t')).join('\n');
    window.copyTextHelper(textStr);
  }
}

let timerInterval = null;
window.nextMatchIdToCopy = '';

function updateNextMatchBanner() {
  let nextMatch = globalMatches.find(m => m.status === 'Upcoming');
  
  const banner = document.getElementById('next-match-banner');
  const timerText = document.getElementById('next-match-timer-text');
  const idText = document.getElementById('next-match-id-text');
  
  if (!nextMatch || !banner) {
    if (banner) banner.style.display = 'none';
    if (timerInterval) clearInterval(timerInterval);
    return;
  }
  
  banner.style.display = 'flex';
  const displayId = nextMatch.matchId || nextMatch.id;
  idText.value = displayId;
  
  window.nextMatchIdToCopy = displayId;
  window.nextMatchDocId = nextMatch.id;
  
  const targetTime = new Date(nextMatch.schedule || nextMatch.matchTime || nextMatch.time || 0).getTime();
  
  if(timerInterval) clearInterval(timerInterval);
  
  const updateTimer = () => {
    const now = Date.now();
    const diff = targetTime - now;
    
    if (diff <= 0) {
      timerText.innerHTML = `<span style="color:#10b981;">Starting NOW!</span>`;
    } else {
      let h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      let m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      let s = Math.floor((diff % (1000 * 60)) / 1000);
      
      let tStr = '';
      if(h > 0) tStr += `${h}h `;
      tStr += `${m}m ${s}s`;
      
      timerText.innerHTML = `${tStr}`;
      
      if (diff > 0 && diff <= 5 * 60 * 1000) {
        if (!window.hasPlayed5MinAlert) {
          if (typeof window.playAlertSound === 'function') window.playAlertSound();
          window.hasPlayed5MinAlert = true;
        }
      } else if (diff > 5 * 60 * 1000) {
        window.hasPlayed5MinAlert = false;
      }
    }
  };
  
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

window.copyNextMatchId = () => {
  if (window.nextMatchIdToCopy) {
    window.copyTextHelper(window.nextMatchIdToCopy);
  }
};

window.viewNextMatchPlayers = () => {
  if (window.nextMatchDocId) {
    openSheet(window.nextMatchDocId);
  }
};

window.copyTextHelper = function(text) {
  if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }
  navigator.clipboard.writeText(text).then(function() {
    alert('Copied successfully!');
  }).catch(function(err) {
    fallbackCopyTextToClipboard(text);
  });
};

function fallbackCopyTextToClipboard(text) {
  var textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    var successful = document.execCommand('copy');
    if(successful) alert('Copied successfully!');
    else alert('Failed to copy.');
  } catch (err) {
    alert('Failed to copy.');
  }
  document.body.removeChild(textArea);
}

function renderPenalties() {
  const list = document.getElementById('penalty-list');
  if (!list) return;

  const penaltyMatches = globalMatches.filter(m => m.roomHostedBy === currentStaff.username && m.latePenalty === true);
  
  const penaltySpan = document.getElementById('e-penalty');
  if (penaltySpan) {
    penaltySpan.innerText = penaltyMatches.length * 4;
  }
  
  if (penaltyMatches.length === 0) {
    list.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="color:#6b7280;">No penalties found! Great job.</td></tr>';
    return;
  }

  let html = '';
  penaltyMatches.forEach(m => {
    const displayId = m.matchId || m.id;
    let actionBtn = '';
    if (m.disputed) {
      actionBtn = `<span class="badge" style="background:#fef3c7; color:#d97706; padding:4px 8px; border-radius:0;">Under Review</span>`;
    } else {
      actionBtn = `<button onclick="disputePenalty('${m.id}')" style="background:#fff; border:1px solid #d1d5db; padding:4px 10px; font-size:12px; font-weight:bold; cursor:pointer; color:#374151; transition:0.2s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">Dispute</button>`;
    }

    html += `
      <tr>
        <td style="font-weight:600; color:#0f172a;">#${displayId}</td>
        <td style="font-weight:600; color:#111827;">${m.title || 'Untitled Match'}</td>
        <td><span class="badge" style="background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:4px; font-size:12px;">${m.status}</span></td>
        <td style="color:#b91c1c; font-size:13px;"><i class="fas fa-info-circle"></i> ${m.penaltyReason || 'Late Penalty'}</td>
        <td class="text-center" style="font-weight:700; color:#ef4444;">-4 Coins</td>
        <td class="text-center">${actionBtn}</td>
      </tr>
    `;
  });
  
  list.innerHTML = html;
}

// Override default alert
window.alert = function(msg) {
  const overlay = document.getElementById('custom-alert-overlay');
  const msgDiv = document.getElementById('custom-alert-msg');
  if (overlay && msgDiv) {
    msgDiv.innerText = msg;
    overlay.style.display = 'flex';
  } else {
    console.log("Alert:", msg);
  }
};

window.closeCustomAlert = function() {
  const overlay = document.getElementById('custom-alert-overlay');
  if (overlay) overlay.style.display = 'none';
};

window.copyFullInfo = (mid) => {
  const m = globalMatches.find(x => x.id === mid);
  if (!m) return;
  const ridInput = document.getElementById(`rid-${mid}`);
  const rpassInput = document.getElementById(`rpass-${mid}`);
  const rid = ridInput ? ridInput.value.trim() : (m.roomId || 'TBA');
  const rpass = rpassInput ? rpassInput.value.trim() : (m.roomPassword || 'TBA');
  
  const text = `🏆 Match ID: #${m.matchId || m.id}\n🎮 Game: ${m.gameName || 'Game'} | ${m.map || m.matchType || 'Classic'}\n⏰ Time: ${m.schedule || m.matchTime || m.time || 'N/A'}\n\n🔑 Room ID: ${rid}\n🔐 Password: ${rpass}\n\nJoin fast!`;
  
  window.copyTextHelper(text);
  alert("Room info copied to clipboard! You can paste it directly on WhatsApp or Telegram.");
};

window.hasPlayed5MinAlert = false;
window.playAlertSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); 
    
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {
    console.log("Audio not supported or blocked");
  }
};

window.toggleDarkMode = () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('staff_dark_mode', isDark ? '1' : '0');
  
  const icon = document.getElementById('dark-mode-icon');
  const text = document.getElementById('dark-mode-text');
  if (isDark) {
    icon.classList.remove('fa-moon');
    icon.classList.add('fa-sun');
    text.innerText = "Light Mode";
  } else {
    icon.classList.remove('fa-sun');
    icon.classList.add('fa-moon');
    text.innerText = "Dark Mode";
  }
};

// Check on load
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('staff_dark_mode') === '1') {
    window.toggleDarkMode();
  }
});

window.disputePenalty = async (mid) => {
  const reason = prompt("Enter the reason for dispute (e.g., Internet disconnected, Game crashed):");
  if (!reason || !reason.trim()) return;
  
  await fb.updateMatch(mid, {
    disputed: true,
    disputeReason: reason.trim(),
    disputeStatus: 'Pending',
    disputeTime: Date.now()
  });
  
  alert("Dispute submitted successfully! Admin will review it and refund your coins if the reason is valid.");
};

window.renderLeaderboard = () => {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  
  fb.listenStaff(staffs => {
    // Sort staffs by hostedCount descending
    const sortedStaffs = [...staffs].sort((a, b) => (b.hostedCount || 0) - (a.hostedCount || 0)).slice(0, 5);
    
    if (sortedStaffs.length === 0) {
      list.innerHTML = '<tr><td colspan="3" class="text-center">No data</td></tr>';
      return;
    }
    
    let html = '';
    sortedStaffs.forEach((s, index) => {
      let icon = '';
      if (index === 0) icon = '<i class="fas fa-medal" style="color:#fbbf24;"></i>';
      else if (index === 1) icon = '<i class="fas fa-medal" style="color:#9ca3af;"></i>';
      else if (index === 2) icon = '<i class="fas fa-medal" style="color:#b45309;"></i>';
      
      html += `
        <tr>
          <td class="text-center" style="font-weight:bold; color:#4b5563;">${index + 1}</td>
          <td style="font-weight:600; color:#1f2937;">${s.username} ${icon}</td>
          <td class="text-center" style="font-weight:bold; color:#10b981;">${s.hostedCount || 0}</td>
        </tr>
      `;
    });
    list.innerHTML = html;
  });
};

// Start leaderboard rendering when script loads
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.renderLeaderboard === 'function') {
    window.renderLeaderboard();
  }
});

window.updateMatchStatus = async (mid) => {
  const newStatus = document.getElementById(`status-${mid}`).value;
  if (!confirm(`Are you sure you want to mark this match as ${newStatus}?`)) {
    renderMatches(); // revert
    return;
  }
  try {
    await fb.updateMatch(mid, { status: newStatus });
    alert(`Match status updated to ${newStatus} successfully!`);
  } catch (err) {
    alert("Error updating status: " + err.message);
  }
};
window.activeResultMatch = null;

window.safeSet = (id, val, prop='value') => {
  const el = document.getElementById(id);
  if(el) el[prop] = val;
};
window.safeGet = (id, prop='value') => {
  const el = document.getElementById(id);
  return el ? el[prop] : null;
};
window.showToast = (msg) => alert(msg);

window.getTeamSize = (fmt) => {
  fmt = (fmt || '').toLowerCase();
  if(fmt.includes('squad') || fmt.includes('4v4')) return 4;
  if(fmt.includes('duo') || fmt.includes('2v2')) return 2;
  if(fmt.includes('solo') || fmt.includes('1v1') || fmt.includes('ump') || fmt.includes('lone_wolf')) return 1;
  if(fmt.includes('6v6')) return 6;
  return 0;
};

window.openResultModal = (mid) => {
  const match = globalMatches.find(m => m.id === mid);
  if (!match) return;
  activeResultMatch = match;
  safeSet('result-match-info', `${match.title} (${match.gameName})`, 'innerText');

  safeSet('calc-per-kill', match.perKill || 0);
  safeSet('calc-win-bonus', match.prizePool || 0);

  const list = document.getElementById('player-result-list');
  if (!list) return;
  list.innerHTML = '';

  const players = (match.joinedPlayers || []);
  const igns = match.joinedIGNs || [];
  const existingWinners = match.winners || [];
  const format = (match.matchFormat || match.format || '').toLowerCase();
  const teamSize = getTeamSize(format);
  const validPlayers = players.map((uid, i) => ({ uid, ign: igns[i] || 'Player' })).filter(p => p.uid && p.uid.trim() !== '');
  const isHeadToHeadFormat = format.includes('team_win') || format.includes('clash_squad') || format.includes('lone_wolf') || format.includes('ump');
  const isTeamMatch = isHeadToHeadFormat && teamSize >= 1 && validPlayers.length > 0 && validPlayers.length <= teamSize * 2;

  const totalSpots = match.totalSpots || 1;
  const originalPrize = match.prizePool || (match.entryFee * totalSpots) || 0;
  const actualJoined = match.joinedSpots || validPlayers.length;
  const totalPrize = Math.floor((originalPrize / totalSpots) * actualJoined) || 0;
  const prizeEachWinner = teamSize > 0 ? Math.floor(totalPrize / teamSize) : totalPrize;

  const teamSection = document.getElementById('team-result-section');
  if (teamSection) teamSection.style.display = isTeamMatch ? 'block' : 'none';

  if (isTeamMatch && teamSection) {
    const teamA = validPlayers.slice(0, teamSize);
    const teamB = validPlayers.slice(teamSize, teamSize * 2);

    const renderTeam = (containerId, team, color) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = team.length === 0
        ? `<div style="color:#6b7280;font-size:12px;text-align:center;">No players yet</div>`
        : team.map(p => `<div style="padding:6px 8px;margin-bottom:4px;background:${color}33;font-weight:600;font-size:13px;color:#333;">👤 ${p.ign}</div>`).join('');
    };
    renderTeam('team-a-players', teamA, '#3b82f6');
    renderTeam('team-b-players', teamB, '#ef4444');

    const applyWin = (winTeam, winLabel) => {
      if (teamA.length === 0 || teamB.length === 0) {
          alert('Cannot declare! Opponent team has not joined.');
          return;
      }
      const pk = Number(safeGet('calc-per-kill')) || 0;
      list.querySelectorAll('tr').forEach(row => {
        const kills = Number(row.querySelector('.res-kills')?.value) || 0;
        const rowUid = row.querySelector('.res-kills')?.dataset.uid || '';
        const isWinner = winTeam.some(p => p.uid === rowUid);
        row.querySelector('.res-rank').value = isWinner ? 1 : 2;
        row.querySelector('.res-prize').value = (isWinner ? prizeEachWinner : 0) + (kills * pk);
      });
      alert(`Team ${winLabel} selected as Winner!`);
    };

    const btnA = document.getElementById('btn-team-a-win');
    const btnB = document.getElementById('btn-team-b-win');
    if (btnA) btnA.onclick = () => applyWin(teamA, 'A');
    if (btnB) btnB.onclick = () => applyWin(teamB, 'B');
  }

  const isSurvivalFormat = format.includes('survival');
  const hideKills = isHeadToHeadFormat || isSurvivalFormat;
  const thKills = document.getElementById('th-kills');
  const calcKillGroup = document.getElementById('calc-kill-group');
  if (thKills) thKills.style.display = hideKills ? 'none' : 'table-cell';
  if (calcKillGroup) calcKillGroup.style.display = hideKills ? 'none' : 'block';

  validPlayers.forEach(({ uid, ign }) => {
    const existing = existingWinners.find(w => w.uid === uid || w.ign === ign);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" class="form-control res-rank" value="${existing?.rank || 0}"></td>
      <td><div style="font-weight:700">${ign}</div><div style="font-size:10px;color:#6b7280">${uid}</div></td>
      <td style="display: ${hideKills ? 'none' : 'table-cell'}"><input type="number" class="form-control res-kills" data-uid="${uid}" data-ign="${ign}" value="${existing?.kills || 0}"></td>
      <td><input type="number" class="form-control res-prize" value="${existing?.prize || 0}" disabled style="font-weight:700;color:#10b981;background:#f1f5f9;cursor:not-allowed;"></td>
    `;
    list.appendChild(tr);
  });

  list.querySelectorAll('.res-rank, .res-kills').forEach(input => input.addEventListener('input', recalculatePrizes));

  document.getElementById('result-modal').style.display = 'flex';
};

window.recalculatePrizes = () => {
  const pk = Number(safeGet('calc-per-kill')) || 0;
  const wb = Number(safeGet('calc-win-bonus')) || 0;
  const fmt = (activeResultMatch?.matchFormat || activeResultMatch?.format || '').toLowerCase();

  const isVsMatch      = fmt.includes('team_win') || fmt.includes('clash_squad') || fmt.includes('lone_wolf') || fmt.includes('ump');
  const isSoloSurvival = fmt.includes('solo_survival');
  const isPerKill      = fmt === 'per_kill';
  const isDuoPerKill   = fmt === 'duo_per_kill';
  const isSurvival     = fmt.includes('survival') && !isSoloSurvival;

  document.querySelectorAll('#player-result-list tr').forEach(row => {
    const rank  = Number(row.querySelector('.res-rank')?.value)  || 0;
    const kills = Number(row.querySelector('.res-kills')?.value) || 0;
    let prize = 0;

    if (isVsMatch) {
      let teamSize = getTeamSize(fmt);
      if (teamSize === 0) teamSize = 1;
      prize = rank === 1 ? Math.floor(wb / teamSize) : 0;
    } else if (isDuoPerKill) {
      prize = kills * pk;
    } else if (isSoloSurvival) {
      const r1   = Math.floor(wb * (45 / 205));
      const r2   = Math.floor(wb * (30 / 205));
      const r3   = Math.floor(wb * (25 / 205));
      const r4_6 = Math.floor(wb * (20 / 205));
      const r7_8 = Math.floor(wb * (15 / 205));
      const r9   = Math.floor(wb * (10 / 205));
      const r10  = wb - r1 - r2 - r3 - (r4_6 * 3) - (r7_8 * 2) - r9;
      if      (rank === 1) prize = r1;
      else if (rank === 2) prize = r2;
      else if (rank === 3) prize = r3;
      else if (rank >= 4 && rank <= 6) prize = r4_6;
      else if (rank === 7 || rank === 8) prize = r7_8;
      else if (rank === 9) prize = r9;
      else if (rank === 10) prize = r10;
    } else if (isPerKill) {
      prize = kills * pk;
    } else if (isSurvival) {
      const first  = Math.floor(wb * 0.60);
      const second = wb - first;
      if      (rank === 1) prize = first;
      else if (rank === 2) prize = second;
    } else {
      if (rank === 1) prize = wb;
      prize += kills * pk;
    }
    row.querySelector('.res-prize').value = prize;
  });
};

const submitResultBtn = document.getElementById('btn-submit-result');
if (submitResultBtn) {
  submitResultBtn.onclick = async () => {
    if(!activeResultMatch) return;
    
    const format = (activeResultMatch.matchFormat || activeResultMatch.format || '').toLowerCase();
    const tSize = getTeamSize(format);
    const vPlayers = (activeResultMatch.joinedPlayers || []).filter(uid => uid && uid.trim() !== '');
    const isVs = format.includes('team_win') || format.includes('clash_squad') || format.includes('lone_wolf') || format.includes('ump');
    if (isVs && tSize >= 1 && vPlayers.length <= tSize && vPlayers.length > 0) {
        alert('Cannot declare result! Opponent team (Team B) has not joined.');
        return;
    }
    
    if (activeResultMatch.status === 'Resulted' && activeResultMatch.payoutsProcessed) {
      if(!confirm("Warning: Payouts for this match were already processed. Are you sure?")) return;
    }

    submitResultBtn.disabled = true; submitResultBtn.innerText = "Saving Result...";
    
    const winners = [];
    let totalDistributed = 0;
    try {
      const rows = document.querySelectorAll('#player-result-list tr');
      for(let row of rows) {
        const rank = Number(row.querySelector('.res-rank').value);
        const killInput = row.querySelector('.res-kills');
        const prize = Number(row.querySelector('.res-prize').value);
        const uid = killInput.dataset.uid;
        
        if (rank > 0 || prize > 0) winners.push({ uid, ign: killInput.dataset.ign, kills: Number(killInput.value), prize, rank });
        totalDistributed += prize;
      }
      winners.sort((a,b) => (a.rank || 999) - (b.rank || 999));
      
      const updateData = { 
        status: 'Resulted', 
        winners, 
        totalDistributedPrize: totalDistributed 
      };
      
      if (!activeResultMatch.resultDeclaredAt) {
        updateData.resultDeclaredAt = Date.now();
        updateData.payoutsProcessed = false;
      }

      await fb.updateMatch(activeResultMatch.id, updateData);
      
      alert('✅ Result Declared & Saved Successfully!');
      document.getElementById('result-modal').style.display = 'none';
    } catch (err) { 
      alert('Error: ' + err.message); 
    }
    finally { 
      submitResultBtn.disabled = false; 
      submitResultBtn.innerHTML = '<i class="fas fa-gavel"></i> Declare Result'; 
    }
  };
}

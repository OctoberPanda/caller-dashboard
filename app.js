// ── CALLER DASHBOARD v5 ──────────────────

const CONFIG_KEY = 'caller_dashboard_config';
const LOGS_KEY   = 'caller_dashboard_logs';
const TODAY      = new Date();
const TODAY_STR  = formatDate(TODAY);

let config        = {};
let banks         = [];
let filteredBanks = [];
let todayLogs     = {};
let openCardRI    = null;
let currentModal  = null;
let refreshTimer  = null;

const COL = {
  ROW_NUM:0,BANK_NAME:1,REP_DIALS:2,TEAM_DIALS:3,STATE:4,CITY:5,REGULATOR:6,TOP_AA:7,
  CEO_NAME:8,CEO_PHONE:9,CEO_EA:10,CEO_EMAIL_DATE:11,CEO_INIT_CALL:12,CEO_RECENT_CALL:13,
  CEO_TIMES_CALLED:14,CEO_WHO:15,CEO_NOTES:16,CEO_OUTCOME:17,
  CRA_NAME:18,CRA_PHONE:19,CRA_EMAIL_INIT:20,CRA_EMAIL_RECENT:21,CRA_INIT_CALL:22,
  CRA_RECENT_CALL:23,CRA_TIMES_CALLED:24,CRA_WHO:25,CRA_NOTES:26,CRA_OUTCOME:27,
  CFO_NAME:28,CFO_PHONE:29,CFO_EMAIL_INIT:30,CFO_EMAIL_RECENT:31,CFO_INIT_CALL:32,
  CFO_RECENT_CALL:33,CFO_TIMES_CALLED:34,CFO_WHO:35,CFO_NOTES:36,CFO_OUTCOME:37,
};

const CD = {
  CEO:{ name:COL.CEO_NAME, phone:COL.CEO_PHONE, ea:COL.CEO_EA, emailDate:COL.CEO_EMAIL_DATE,
        initCall:COL.CEO_INIT_CALL, recentCall:COL.CEO_RECENT_CALL, times:COL.CEO_TIMES_CALLED,
        who:COL.CEO_WHO, notes:COL.CEO_NOTES, outcome:COL.CEO_OUTCOME },
  CRA:{ name:COL.CRA_NAME, phone:COL.CRA_PHONE, ea:null, emailDate:COL.CRA_EMAIL_INIT,
        initCall:COL.CRA_INIT_CALL, recentCall:COL.CRA_RECENT_CALL, times:COL.CRA_TIMES_CALLED,
        who:COL.CRA_WHO, notes:COL.CRA_NOTES, outcome:COL.CRA_OUTCOME },
  CFO:{ name:COL.CFO_NAME, phone:COL.CFO_PHONE, ea:null, emailDate:COL.CFO_EMAIL_INIT,
        initCall:COL.CFO_INIT_CALL, recentCall:COL.CFO_RECENT_CALL, times:COL.CFO_TIMES_CALLED,
        who:COL.CFO_WHO, notes:COL.CFO_NOTES, outcome:COL.CFO_OUTCOME },
};

// Exact outcome options from the sheet
const OUTCOME_OPTIONS = [
  'No Answer',
  'Left Message',
  'Check Back Later',
  'Expressed Interest',
  'Follow-up',
  'Email requested/ Follow-up',
  'Decline',
  'Wrong Contact',
  'Wrong Number',
  'Not the bank\'s fund type',
  'Open',
  'Request To Unsubscribe',
];

// Who answered options (Other People column — separate from outcome)
const WHO_OPTIONS = ['NO CONTACT','GK','EA','CEO','CRA','CFO','Operator'];

// Bad number issue types — separate from outcomes entirely
const BAD_NUMBER_ISSUES = [
  'Black box VM',
  'Dead air',
  'Unidentifiable VM',
  'Wrong number',
  'Not in service',
  'Fax machine',
  'Did not hear full name',
];

// Outcomes that count as unconfirmed (flag after 2)
const UNCONFIRMED_OUTCOMES = new Set(['No Answer', 'No Answer / No VM']);
// Outcomes that count as confirmed attempt (flag after 7)
const CONFIRMED_OUTCOMES   = new Set(['Left Message','Follow-up','Email requested/ Follow-up','Check Back Later']);

const OUTCOME_COLOR = {
  'Expressed Interest':'green','Follow-up':'blue','Email requested/ Follow-up':'blue',
  'Check Back Later':'amber','Open':'amber','Decline':'red',
  'Request To Unsubscribe':'red','Wrong Number':'red','Wrong Contact':'red',
  'Not the bank\'s fund type':'red','Left Message':'blue',
};

const SESSION_ID = Date.now().toString(36);

// ── EMERGENCY RESET ─────────────────────
// If URL contains ?reset, wipe logs and redirect cleanly
(function(){
  if(window.location.search.includes('reset')){
    const cfg=localStorage.getItem('caller_dashboard_config');
    localStorage.clear();
    if(cfg) localStorage.setItem('caller_dashboard_config',cfg);
    window.location.href=window.location.pathname;
  }
})();

// ── INIT ────────────────────────────────
window.onload = () => {
  config    = loadConfig();
  // Force wipe any logs not from today BEFORE anything else
  const stored = JSON.parse(localStorage.getItem(LOGS_KEY)||'{}');
  if(stored._date !== formatDate(new Date())){
    localStorage.setItem(LOGS_KEY, JSON.stringify({_date:formatDate(new Date())}));
    // Also wipe flags
    Object.keys(localStorage).filter(k=>k.startsWith('flags_')).forEach(k=>localStorage.removeItem(k));
  }
  todayLogs = loadTodayLogs();
  checkOAuthCallback();
  if(!config.sheetId||!config.tabName||!config.apiKey){
    showScreen('setup-screen'); prefillSetup();
  } else {
    showScreen('main-app'); initApp();
  }
};

function prefillSetup(){
  setVal('setup-rep-name',config.repName||'');
  setVal('setup-sheet-id',config.sheetId||'');
  setVal('setup-tab-name',config.tabName||'');
  setVal('setup-api-key',config.apiKey||'');
}

function saveSetup(){
  const repName=gv('setup-rep-name').trim();
  const sheetId=gv('setup-sheet-id').trim();
  const tabName=gv('setup-tab-name').trim();
  const apiKey =gv('setup-api-key').trim();
  const googleClientId=gv('setup-client-id').trim();
  if(!repName||!sheetId||!tabName||!apiKey){ toast('Please fill in all fields','error'); return; }
  config={...config,repName,sheetId,tabName,apiKey,googleClientId};
  saveConfig();
  if(config.googleClientId){
    showScreen('auth-screen');
  } else {
    showScreen('main-app');
    initApp();
  }
}

function initApp(){
  setText('rep-name-badge', config.repName||'Rep');
  setText('today-date', formatDateLong(TODAY));
  // Show write-back status in topbar
  const wb=document.getElementById('writeback-status');
  if(wb){
    if(config.oauthToken){ wb.textContent='✓ Write-back on'; wb.style.color='var(--green)'; }
    else{ wb.textContent='Read only'; wb.style.color='var(--text3)'; }
  }
  loadSheet();
  clearInterval(refreshTimer);
  refreshTimer=setInterval(silentRefresh, 5*60*1000);
}

async function silentRefresh(){
  await loadSheetData();
  renderStats();
  if(openCardRI) renderLeadsGrid(openCardRI);
}

// ── LOAD SHEET ──────────────────────────
async function loadSheet(){
  document.getElementById('bank-list').innerHTML='<div class="loading">Loading your sheet...</div>';
  const ok=await loadSheetData();
  if(ok){ renderStats(); populateStateFilter(); renderBankList(getVisibleBanks()); }
}

async function loadSheetData(){
  const range=encodeURIComponent(`'${config.tabName}'`);
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${range}?key=${config.apiKey}`;
  try{
    const res=await fetch(url);
    const data=await res.json();
    if(data.error){
      document.getElementById('bank-list').innerHTML=
        `<div class="loading error">❌ ${data.error.message}<br><br>Check Sheet ID, tab name, and API key in ⚙️ Settings</div>`;
      return false;
    }
    const rows=data.values||[];
    banks=rows.slice(2).map((row,i)=>({_rowIndex:i+3,data:row})).filter(b=>b.data[COL.BANK_NAME]?.trim());
    return true;
  }catch(e){
    document.getElementById('bank-list').innerHTML=
      `<div class="loading error">❌ Network error. Check your API key and internet connection.</div>`;
    return false;
  }
}

// ── HELPERS ─────────────────────────────
function parsePhones(str){
  if(!str||String(str).trim()==='') return [];
  return String(str).split(/[;,]/).map(p=>p.trim()).filter(Boolean);
}

function isBankDeclined(ri){
  const logs=todayLogs[ri]||[];
  if(logs.some(l=>!l.deleted&&l.outcome==='Decline')) return true;
  const bank=banks.find(b=>b._rowIndex===ri);
  if(!bank) return false;
  return ['CEO','CRA','CFO'].some(r=>bank.data[CD[r].outcome]==='Decline');
}

function getVisibleBanks(){
  const status=gv('filter-status');
  if(status==='declined') return banks.filter(b=>isBankDeclined(b._rowIndex));
  return banks.filter(b=>!isBankDeclined(b._rowIndex));
}

function mostRecentEmail(d,role){
  if(role==='CEO') return d[COL.CEO_EMAIL_DATE]||'';
  if(role==='CRA'){
    const a=d[COL.CRA_EMAIL_INIT]||'',b=d[COL.CRA_EMAIL_RECENT]||'';
    if(!a)return b; if(!b)return a;
    try{return new Date(b)>new Date(a)?b:a;}catch{return b||a;}
  }
  if(role==='CFO'){
    const a=d[COL.CFO_EMAIL_INIT]||'',b=d[COL.CFO_EMAIL_RECENT]||'';
    if(!a)return b; if(!b)return a;
    try{return new Date(b)>new Date(a)?b:a;}catch{return b||a;}
  }
  return '';
}

// Get active (non-deleted) logs for a row+role
function activeLogs(ri, role){
  return (todayLogs[ri]||[]).filter(l=>!l.deleted&&(role?l.role===role:true));
}

function getLeadCounters(ri,role){
  const logs=activeLogs(ri,role);
  let unconfirmed=0, confirmed=0;
  logs.forEach(l=>{
    if(UNCONFIRMED_OUTCOMES.has(l.outcome)) unconfirmed++;
    if(CONFIRMED_OUTCOMES.has(l.outcome))   confirmed++;
  });
  return {unconfirmed,confirmed};
}

// Reconstruct what the sheet fields should be after deletions
function reconstructLeadState(ri, role, originalData){
  const c=CD[role];
  const logs=activeLogs(ri,role);
  const flags=getFlagsForRole(ri,role).filter(f=>!f.undone);

  if(!logs.length && !flags.length){
    // Nothing logged today — revert to original sheet data
    return {
      recentCall: originalData[c.recentCall]||'',
      times:      String(Math.max(0,(parseInt(originalData[c.times])||0))),
      outcome:    originalData[c.outcome]||'',
      who:        originalData[c.who]||'',
      notes:      originalData[c.notes]||'',
    };
  }

  // Build notes from original (pre-today) + today's active entries
  const originalNotes=(originalData[c.notes]||'').split('\n').filter(l=>!l.match(/^\d+\/\d+\/\d{4}/)).join('\n');
  const todayNoteLines=[];
  logs.forEach(l=> todayNoteLines.push(l.noteEntry));
  flags.forEach(f=> todayNoteLines.push(f.noteEntry));

  const allNotes=[originalNotes,...todayNoteLines].filter(Boolean).join('\n');

  // Most recent date from active logs
  const lastLog=logs[logs.length-1];
  const recentCall=lastLog?TODAY_STR:(originalData[c.recentCall]||'');

  // Times called = original + today's active count
  const origTimes=parseInt(originalData[c.times])||0;
  const todayCount=logs.length;
  const times=String(origTimes+todayCount);

  // Outcome = last active log's outcome
  const outcome=lastLog?lastLog.outcome:(originalData[c.outcome]||'');
  const who=lastLog?lastLog.who:(originalData[c.who]||'');

  return {recentCall,times,outcome,who,notes:allNotes};
}

function getBadNumberIssue(ri,role,phone){
  // Check local flags first
  const localFlag=getFlagsForRole(ri,role).find(f=>f.phone===phone&&!f.undone);
  if(localFlag) return localFlag.issue;
  // Fall back to sheet notes
  const bank=banks.find(b=>b._rowIndex===ri);
  if(!bank) return '';
  const notes=bank.data[CD[role].notes]||'';
  const escapedPhone=phone.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=notes.match(new RegExp(escapedPhone+' — ([^.\\n|]+)'));
  return match?match[1].trim():'Bad number';
}
// Stored separately from call logs
function getFlagsForRole(ri,role){
  const key=`flags_${ri}_${role}`;
  try{ return JSON.parse(localStorage.getItem(key))||[]; }catch{ return []; }
}
function saveFlagsForRole(ri,role,flags){
  localStorage.setItem(`flags_${ri}_${role}`,JSON.stringify(flags));
}
function isPhoneFlagged(ri,role,phone){
  // Check local flags first
  if(getFlagsForRole(ri,role).some(f=>f.phone===phone&&!f.undone)) return true;
  // Also check sheet notes for ⚠️ BAD NUMBER pattern
  const bank=banks.find(b=>b._rowIndex===ri);
  if(!bank) return false;
  const notes=bank.data[CD[role].notes]||'';
  return notes.includes(phone+' —')||notes.includes(phone+' — ');
}

// ── STATS ────────────────────────────────
function renderStats(){
  const all=Object.values(todayLogs).flat().filter(l=>!l.deleted);
  const dials=all.length;
  const banksReached=new Set(
    all.filter(l=>l.outcome!=='No Answer'&&!['Black box VM','Dead air','Unidentifiable VM','Not in service','Fax machine','Did not hear full name'].includes(l.outcome))
       .map(l=>l.rowIndex)
  ).size;
  const connects=new Set(all.filter(l=>l.forTressika).map(l=>l.rowIndex)).size;
  const sos=Object.keys(todayLogs).reduce((acc,ri)=>{
    return acc+['CEO','CRA','CFO'].reduce((a,r)=>a+getFlagsForRole(parseInt(ri),r).filter(f=>!f.undone).length,0);
  },0);
  const declined=banks.filter(b=>isBankDeclined(b._rowIndex)).length;
  setText('stat-dials',    dials);
  setText('stat-reached',  banksReached);
  setText('stat-connects', connects);
  setText('stat-sos',      sos);
  setText('stat-declined', declined);
  setText('stat-total',    banks.filter(b=>!isBankDeclined(b._rowIndex)).length);
}

// ── FILTERS ──────────────────────────────
function populateStateFilter(){
  const sel=document.getElementById('filter-state');
  const states=[...new Set(banks.map(b=>b.data[COL.STATE]).filter(Boolean))].sort();
  sel.innerHTML='<option value="">All states</option>';
  states.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});
}

function filterBanks(){
  const search=gv('search-input').toLowerCase();
  const state=gv('filter-state');
  const status=gv('filter-status');
  let pool=status==='declined'
    ?banks.filter(b=>isBankDeclined(b._rowIndex))
    :banks.filter(b=>!isBankDeclined(b._rowIndex));
  const result=pool.filter(b=>{
    const d=b.data,ri=b._rowIndex,logs=activeLogs(ri);
    if(search&&!(d[COL.BANK_NAME]||'').toLowerCase().includes(search)) return false;
    if(state&&d[COL.STATE]!==state) return false;
    if(status==='sos') return ['CEO','CRA','CFO'].some(r=>getFlagsForRole(ri,r).some(f=>!f.undone));
    if(status==='interest') return logs.some(l=>l.outcome==='Expressed Interest')||['CEO','CRA','CFO'].some(r=>d[CD[r].outcome]==='Expressed Interest');
    if(status==='connect') return logs.some(l=>l.forTressika);
    if(status==='called-today')      return logs.length>0;
    if(status==='not-called-today') return logs.length===0;
    if(status==='attention') return ['CEO','CRA','CFO'].some(r=>{const {unconfirmed,confirmed}=getLeadCounters(ri,r);return unconfirmed>=2||confirmed>=7;});
    return true;
  });
  renderBankList(result);
}

// ── RENDER LIST ──────────────────────────
function renderBankList(list){
  filteredBanks=list;
  const el=document.getElementById('bank-list');
  const activeCount=banks.filter(b=>!isBankDeclined(b._rowIndex)).length;
  setText('filter-count',`${list.length} of ${activeCount} active banks`);
  if(!list.length){el.innerHTML='<div class="loading">No banks match your filter.</div>';return;}
  el.innerHTML='';
  list.forEach(b=>el.appendChild(buildBankCard(b)));
}

// ── BANK CARD ────────────────────────────
function buildBankCard(bank){
  const d=bank.data,ri=bank._rowIndex;
  const logs=activeLogs(ri);
  const declined=isBankDeclined(ri);
  const calledToday=logs.length>0;
  const hasSOS=['CEO','CRA','CFO'].some(r=>getFlagsForRole(ri,r).some(f=>!f.undone));
  const hasInterest=logs.some(l=>l.outcome==='Expressed Interest')||['CEO','CRA','CFO'].some(r=>d[CD[r].outcome]==='Expressed Interest');
  const hasConnect=logs.some(l=>l.forTressika);
  const needsAttention=['CEO','CRA','CFO'].some(r=>{const{unconfirmed,confirmed}=getLeadCounters(ri,r);return unconfirmed>=2||confirmed>=7;});

  let badges='';
  if(declined)       badges+=`<span class="badge badge-red">✕ Declined</span>`;
  if(calledToday&&!declined) badges+=`<span class="badge badge-green">Called today</span>`;
  if(hasSOS)         badges+=`<span class="badge badge-red">⚠️ SOS</span>`;
  if(hasInterest)    badges+=`<span class="badge badge-green">★ Interest</span>`;
  if(hasConnect)     badges+=`<span class="badge badge-blue">→ Tressika</span>`;
  if(needsAttention) badges+=`<span class="badge badge-amber">! Attention</span>`;

  const card=document.createElement('div');
  card.className=`bank-card${hasSOS?' has-sos':''}${hasInterest?' has-interest':''}${declined?' has-declined':''}`;
  card.id=`bank-card-${ri}`;
  card.innerHTML=`
    <div class="bank-card-header" onclick="toggleCard(${ri})">
      <div class="bank-card-left">
        <span class="row-num">Row ${ri}</span>
        <div>
          <div class="bank-name">${esc(d[COL.BANK_NAME])}</div>
          <div class="bank-meta">${[d[COL.CITY],d[COL.STATE]].filter(Boolean).join(', ')}${d[COL.REGULATOR]?' · '+d[COL.REGULATOR]:''}${d[COL.TOP_AA]?' · '+d[COL.TOP_AA]:''}</div>
        </div>
      </div>
      <div class="bank-card-right">${badges}<span class="chevron" id="chev-${ri}">▼</span></div>
    </div>
    <div class="bank-card-body" id="body-${ri}"></div>`;
  return card;
}

function toggleCard(ri){
  const isOpen=openCardRI===ri;
  if(openCardRI&&openCardRI!==ri){
    const b=document.getElementById(`body-${openCardRI}`);
    const c=document.getElementById(`chev-${openCardRI}`);
    if(b){b.classList.remove('open');b.innerHTML='';}
    if(c) c.classList.remove('open');
  }
  const body=document.getElementById(`body-${ri}`);
  const chev=document.getElementById(`chev-${ri}`);
  if(isOpen){body.classList.remove('open');body.innerHTML='';chev.classList.remove('open');openCardRI=null;}
  else{body.classList.add('open');chev.classList.add('open');openCardRI=ri;renderLeadsGrid(ri);}
}

// ── LEADS GRID ───────────────────────────
function renderLeadsGrid(ri){
  const bank=banks.find(b=>b._rowIndex===ri);
  if(!bank) return;
  const d=bank.data;
  const body=document.getElementById(`body-${ri}`);
  if(!body) return;
  const emailParts=['CEO','CRA','CFO'].map(r=>{const dt=mostRecentEmail(d,r);return dt?`${r}: ${fmtD(dt)}`:''}).filter(Boolean);
  const emailRow=emailParts.length?`<div class="email-row">📧 Most recent email — ${emailParts.join(' · ')}</div>`:'';
  const grid=`<div class="leads-grid">${['CEO','CRA','CFO'].map(r=>buildLeadCard(ri,d,r)).join('')}</div>`;
  body.innerHTML=`<div class="bank-body-inner">${emailRow}${grid}</div>`;
}

function buildLeadCard(ri,d,role){
  const c=CD[role];
  const name=d[c.name]||'—';
  const phones=parsePhones(d[c.phone]);
  const outcome=d[c.outcome]||'';
  const notes=d[c.notes]||'';
  const recent=d[c.recentCall]?fmtD(d[c.recentCall]):'';
  const times=d[c.times]||'0';
  const ea=c.ea!=null?(d[c.ea]||''):'';
  const roleActiveLogs=activeLogs(ri,role);
  const roleFlags=getFlagsForRole(ri,role);
  const {unconfirmed,confirmed}=getLeadCounters(ri,role);
  const hasSOS=roleFlags.some(f=>!f.undone);
  const hasInt=roleActiveLogs.some(l=>l.outcome==='Expressed Interest')||outcome==='Expressed Interest';
  const declined=isBankDeclined(ri);
  const oc=OUTCOME_COLOR[outcome]||'';

  // Attention
  let attentionHtml='';
  if(unconfirmed>=2) attentionHtml+=`<div class="attention-flag amber">⚠️ ${unconfirmed} calls — no answer / no VM. Flag at EOD.</div>`;
  if(confirmed>=7)   attentionHtml+=`<div class="attention-flag amber">⚠️ ${confirmed} confirmed attempts — no connect. Flag at EOD.</div>`;

  // Phone rows
  let phonesHtml='';
  if(phones.length){
    phonesHtml=`<div class="lead-phones">`+
      phones.map((ph,pi)=>{
        const flagged=isPhoneFlagged(ri,role,ph);
        const issue=flagged?getBadNumberIssue(ri,role,ph):'';
        return `<div class="lead-phone-row">
          <div style="flex:1;min-width:0;">
            <span class="lead-phone-num${flagged?' bad':''}">${esc(ph)}</span>
            ${flagged&&issue?`<span class="bad-reason">${esc(issue)}</span>`:''}
          </div>
          <div class="lead-phone-btns">
            <button class="btn-copy-sm" onclick="copyPhone('${esc(ph)}',this)" title="Copy">📋</button>
            ${flagged
              ?`<button class="btn-undo-flag" onclick="undoFlag(${ri},'${role}','${esc(ph)}')">↩ Undo</button>`
              :`<button class="btn-sos-sm" onclick="openFlagModal(${ri},'${role}','${esc(ph)}')" title="Flag bad number">⚠️</button>`
            }
            ${!declined?`<button class="btn-log-sm" onclick="openLogModal(${ri},'${role}',${pi})">Log</button>`:''}
          </div>
        </div>`;
      }).join('')+`</div>`;
  } else {
    phonesHtml=`<div class="no-phone-row">No phone on file</div>`;
  }

  // Notes (sheet history, truncated)
  const notesHtml=notes?`<div class="lead-notes">${esc(notes)}</div>`:'';

  // Today's active log entries with delete button
  let todayHtml='';
  const todayEntries=(todayLogs[ri]||[]).filter(l=>l.role===role&&!l.deleted);
  if(todayEntries.length){
    todayHtml=`<div class="lead-today-logs">`+
      todayEntries.map((l,i)=>`
        <div class="lead-log-entry">
          <div style="flex:1;min-width:0;">
            <span class="log-time">${l.timestamp.split(' ').slice(1).join(' ')}</span>
            <span class="outcome-chip ${OUTCOME_COLOR[l.outcome]||''}">${esc(l.outcome)}</span>
            ${l.who&&l.who!=='NO CONTACT'?`<span class="log-who">${esc(l.who)}</span>`:''}
            ${l.forTressika?'<span class="badge badge-blue" style="font-size:9px">→T</span>':''}
          </div>
          <div style="display:flex;gap:3px;flex-shrink:0;">
            <button class="btn-delete-entry" onclick="deleteEntry(${ri},'${role}','${l.id}')" title="Delete this entry">✕</button>
          </div>
        </div>`).join('')+
      `<button class="btn-delete-all-today" onclick="deleteAllToday(${ri},'${role}')">Clear all today's entries for ${role}</button>`+
      `</div>`;
  }

  return `<div class="lead-card${hasSOS?' lead-sos':''}${hasInt?' lead-interest':''}${declined?' lead-declined':''}">
    <div class="lead-header">
      <div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <span class="lead-role">${role}</span>
          ${outcome?`<span class="outcome-chip ${oc}">${esc(outcome)}</span>`:''}
        </div>
        <div class="lead-name">${esc(name)}</div>
        ${ea?`<div class="lead-ea">EA: ${esc(ea)}</div>`:''}
      </div>
      <div style="text-align:right">
        ${recent?`<div style="font-size:10px;color:var(--text3)">Last: ${recent}</div>`:''}
        <div style="font-size:10px;color:var(--text3)">${times}x called</div>
      </div>
    </div>
    <div class="lead-body">
      ${attentionHtml}
      ${phonesHtml}
      ${notesHtml}
      ${todayHtml}
      ${declined
        ?`<div class="declined-note">Bank declined — calling stopped</div>`
        :`<button class="lead-log-btn" onclick="openLogModal(${ri},'${role}',0)">+ Log call</button>`}
    </div>
  </div>`;
}

// ── COPY PHONE ───────────────────────────
function copyPhone(phone,btn){
  navigator.clipboard.writeText(phone).then(()=>{
    const o=btn.textContent; btn.textContent='✓';
    setTimeout(()=>btn.textContent=o,1500);
  }).catch(()=>{
    const ta=document.createElement('textarea');
    ta.value=phone; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    const o=btn.textContent; btn.textContent='✓';
    setTimeout(()=>btn.textContent=o,1500);
  });
}

// ── FLAG MODAL (bad number) ───────────────
function openFlagModal(ri, role, phone){
  currentModal={type:'flag', rowIndex:ri, role, phone};
  const bank=banks.find(b=>b._rowIndex===ri);
  setText('modal-title', bank?.data[COL.BANK_NAME]||'');
  setText('modal-sub',   `Flag bad number — ${role}: ${phone}`);

  const sel=document.getElementById('log-flag-issue');
  sel.innerHTML=BAD_NUMBER_ISSUES.map(i=>`<option value="${i}">${i}</option>`).join('');

  document.getElementById('flag-section').classList.remove('hidden');
  document.getElementById('log-section').classList.add('hidden');
  document.getElementById('decline-warning').classList.add('hidden');
  document.getElementById('sos-warning').classList.add('hidden');
  document.getElementById('log-modal').classList.remove('hidden');
}

async function saveFlagEntry(){
  if(!currentModal||currentModal.type!=='flag') return;
  const {rowIndex:ri, role, phone}=currentModal;
  const issue=gv('log-flag-issue');
  const now=new Date();
  const ts=formatDateTime(now);
  const todayDate=formatDate(now);
  const timeOnly=now.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit'})+' ET';

  const recentLog=(todayLogs[ri]||[]).filter(l=>l.role===role&&!l.deleted).slice(-1)[0];
  const badNumberNote=`${phone} — ${issue}`;
  let noteEntry;

  if(recentLog&&recentLog.noteEntry){
    // Append to existing note — no extra timestamp at all
    recentLog.noteEntry=recentLog.noteEntry.replace(/\.$/, '')+` | ${badNumberNote}.`;
    noteEntry=recentLog.noteEntry;
    saveTodayLogs();
  } else {
    // Standalone — check if date already in sheet notes
    const bank0=banks.find(b=>b._rowIndex===ri);
    const existingN=bank0?.data[CD[role].notes]||'';
    const dateInNotes=existingN.includes(todayDate);
    const tsPrefix=dateInNotes?timeOnly:`${todayDate} — ${timeOnly}`;
    noteEntry=`${tsPrefix} — ${badNumberNote}.`;
  }

  const flags=getFlagsForRole(ri,role);
  const flagObj={phone, issue, ts, noteEntry:badNumberNote, undone:false, id:genId()};
  flags.push(flagObj);
  saveFlagsForRole(ri,role,flags);

  const bank=banks.find(b=>b._rowIndex===ri);
  if(bank){
    const c=CD[role];
    // If we updated an existing note, rebuild the full notes from scratch
    if(recentLog){
      const allNotes=(bank.data[c.notes]||'').split('\n');
      // Find and replace the old note line with the updated one
      const updated=allNotes.map(line=>
        line.includes(recentLog.timestamp)?recentLog.noteEntry:line
      ).join('\n');
      bank.data[c.notes]=updated;
    } else {
      const existing=bank.data[c.notes]||'';
      bank.data[c.notes]=existing?existing+'\n'+noteEntry:noteEntry;
    }
    await writeCell(ri, c.notes, bank.data[c.notes]);
    await strikethroughPhone(ri, c.phone, bank.data[c.phone]||'', phone);
  }

  renderStats();
  closeModal();
  if(openCardRI===ri) renderLeadsGrid(ri);
  toast('Number flagged','success');
}

let cachedSheetTabId = 0; // default to first sheet

async function getSheetTabId(){
  if(cachedSheetTabId!==0) return cachedSheetTabId;
  try{
    const url=`https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}?key=${config.apiKey}`;
    const res=await fetch(url);
    const data=await res.json();
    const sheet=data.sheets?.find(s=>s.properties.title===config.tabName);
    if(sheet) cachedSheetTabId=sheet.properties.sheetId;
  }catch(e){ console.error('Sheet tab ID error',e); }
  return cachedSheetTabId;
}

async function strikethroughPhone(ri, phoneColIndex, fullPhoneCell, badPhone){
  if(!config.oauthToken||!config.sheetId) return;
  const cellValue=String(fullPhoneCell||'');
  if(!cellValue) return;

  // Find start and end character positions of the bad number
  const start=cellValue.indexOf(badPhone);
  if(start===-1) return;
  const end=start+badPhone.length;

  // Build TextFormatRuns — strikethrough the bad number, normal for the rest
  const runs=[];
  if(start>0) runs.push({startIndex:0, format:{strikethrough:false}});
  runs.push({startIndex:start, format:{strikethrough:true}});
  if(end<cellValue.length) runs.push({startIndex:end, format:{strikethrough:false}});

  const sheetTabId=await getSheetTabId();
  const sheetRow=ri-1;
  const sheetCol=phoneColIndex;

  try{
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}:batchUpdate`,
      {
        method:'POST',
        headers:{'Authorization':`Bearer ${config.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          requests:[{
            updateCells:{
              rows:[{
                values:[{
                  userEnteredValue:{stringValue:cellValue},
                  textFormatRuns:runs
                }]
              }],
              fields:'userEnteredValue,textFormatRuns',
              range:{
                sheetId:sheetTabId,
                startRowIndex:sheetRow,
                endRowIndex:sheetRow+1,
                startColumnIndex:sheetCol,
                endColumnIndex:sheetCol+1
              }
            }
          }]
        })
      }
    );
  }catch(e){ console.error('Strikethrough error',e); }
}

// ── UNDO FLAG ────────────────────────────
async function undoFlag(ri, role, phone){
  const flags=getFlagsForRole(ri,role);
  const flag=flags.find(f=>f.phone===phone&&!f.undone);
  if(!flag) return;
  flag.undone=true;
  saveFlagsForRole(ri,role,flags);

  // Remove flag note line from sheet notes
  const bank=banks.find(b=>b._rowIndex===ri);
  if(bank){
    const c=CD[role];
    const notes=(bank.data[c.notes]||'').split('\n').filter(l=>l!==flag.noteEntry).join('\n');
    bank.data[c.notes]=notes;
    await writeCell(ri, c.notes, notes);
  }

  renderStats();
  if(openCardRI===ri) renderLeadsGrid(ri);
  toast('Flag removed','success');
}

// ── LOG MODAL ────────────────────────────
function openLogModal(ri, role, phoneIndex){
  currentModal={type:'log', rowIndex:ri, role, phoneIndex:null}; // no phone index
  const bank=banks.find(b=>b._rowIndex===ri);
  if(!bank) return;
  const d=bank.data, c=CD[role];
  const name=d[c.name]||'—';

  setText('modal-title', d[COL.BANK_NAME]);
  setText('modal-sub',   `Row ${ri} · ${role}: ${name}`); // no number shown

  const whoSel=document.getElementById('log-who-answered');
  whoSel.innerHTML=WHO_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('');
  whoSel.value='NO CONTACT';

  const outSel=document.getElementById('log-outcome');
  outSel.innerHTML=OUTCOME_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('');
  outSel.value='No Answer';

  setVal('log-spoke-to',''); setVal('log-new-number',''); setVal('log-notes','');
  document.getElementById('sos-warning').classList.add('hidden');
  document.getElementById('decline-warning').classList.add('hidden');
  document.getElementById('btn-tressika').classList.add('hidden');
  document.getElementById('flag-section').classList.add('hidden');
  document.getElementById('log-section').classList.remove('hidden');
  document.getElementById('log-outcome').onchange=checkOutcomeWarnings;
  document.getElementById('log-modal').classList.remove('hidden');
}

function closeModal(){
  document.getElementById('log-modal').classList.add('hidden');
  currentModal=null;
}

function checkOutcomeWarnings(){
  const o=gv('log-outcome');
  document.getElementById('decline-warning').classList.toggle('hidden', o!=='Decline');
  document.getElementById('btn-tressika').classList.toggle('hidden',
    o!=='Expressed Interest'&&o!=='Email requested/ Follow-up');
}

// ── SAVE CALL LOG ────────────────────────
async function saveCallLog(){
  if(!currentModal) return;
  if(currentModal.type==='flag'){ await saveFlagEntry(); return; }

  const {rowIndex:ri, role, phoneIndex}=currentModal;
  const outcome=gv('log-outcome'), who=gv('log-who-answered');
  const spokeTo=gv('log-spoke-to'), newNum=gv('log-new-number'), notesTxt=gv('log-notes');
  if(!outcome){toast('Please select an outcome','error');return;}

  if(outcome==='Decline'){
    if(!confirm(`Confirming decline for ${banks.find(b=>b._rowIndex===ri)?.data[COL.BANK_NAME]}.\n\nThis will stop ALL calling at this bank. Continue?`)) return;
  }

  const bank=banks.find(b=>b._rowIndex===ri);
  const d=bank.data, c=CD[role];
  const phones=parsePhones(d[c.phone]);
  const phone=phones[phoneIndex]||'';
  const ts=formatDateTime(new Date());
  const id=genId();

  // Date shows once per day — subsequent entries just show time
  const now=new Date();
  const todayDate=formatDate(now);
  const timeOnly=now.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit'})+' ET';
  const existingNotes=d[c.notes]||'';
  const dateAlreadyInNotes=existingNotes.includes(todayDate);
  const tsPrefix=dateAlreadyInNotes?timeOnly:`${todayDate} — ${timeOnly}`;

  // Notes only contain what the rep typed — outcome goes in its own column
  let noteEntry='';
  const noteParts=[];
  if(notesTxt) noteParts.push(notesTxt);
  if(spokeTo)  noteParts.push(`Spoke to: ${spokeTo}`);
  if(newNum)   noteParts.push(`New number: ${newNum}`);
  if(outcome==='Decline') noteParts.push(`DECLINED — all calling stopped`);
  if(noteParts.length) noteEntry=`${tsPrefix} — ${noteParts.join('. ')}.`;
  else noteEntry=`${tsPrefix}.`;

  const logEntry={id, rowIndex:ri, role, phoneIndex, phone, who, outcome,
    noteEntry, spokeTo, newNum, timestamp:ts, forTressika:false, deleted:false};

  if(!todayLogs[ri]) todayLogs[ri]=[];
  todayLogs[ri].push(logEntry);
  saveTodayLogs();

  // Update local bank data
  const existing=d[c.notes]||'';
  d[c.notes]     =existing?existing+'\n'+noteEntry:noteEntry;
  d[c.recentCall]=TODAY_STR;
  d[c.times]     =String((parseInt(d[c.times])||0)+1);
  d[c.outcome]   =outcome;
  d[c.who]       =who;
  if(newNum) d[c.phone]=d[c.phone]?d[c.phone]+'; '+newNum:newNum;

  if(outcome==='Decline'){
    ['CEO','CRA','CFO'].filter(r=>r!==role).forEach(r=>{
      const dc=CD[r];
      const dn=`${ts} — DECLINED by ${role} — calling stopped.`;
      d[dc.notes]=(d[dc.notes]||'')+'\n'+dn;
    });
  }

  await writeLeadToSheet(ri, role, bank);
  renderStats();
  rebuildCard(ri, outcome==='Decline');
  closeModal();
  toast(outcome==='Decline'?'Bank marked declined':'Call logged ✓','success');
}

// ── DELETE ENTRY ─────────────────────────
async function deleteEntry(ri, role, id){
  if(!confirm('Delete this log entry? This will also update the sheet.')) return;
  const logs=todayLogs[ri]||[];
  const entry=logs.find(l=>l.id===id);
  if(!entry) return;
  entry.deleted=true;
  saveTodayLogs();

  // Rebuild sheet fields from remaining logs
  const bank=banks.find(b=>b._rowIndex===ri);
  if(bank){
    // Remove this note line
    const c=CD[role];
    const notes=(bank.data[c.notes]||'').split('\n').filter(l=>l!==entry.noteEntry).join('\n');
    bank.data[c.notes]=notes;

    // Recalculate times and recent call from remaining active logs
    const remaining=activeLogs(ri,role);
    const origTimes=parseInt(bank.data[c.times])||0;
    bank.data[c.times]=String(Math.max(0,origTimes-1));

    if(!remaining.length){
      // No more today logs — revert recent call to whatever was in original sheet before today
      // We leave it as-is since we don't have the original; team will see the previous date in notes
    } else {
      const lastLog=remaining[remaining.length-1];
      bank.data[c.outcome]=lastLog.outcome;
      bank.data[c.who]=lastLog.who;
    }

    await writeLeadToSheet(ri,role,bank);
  }

  renderStats();
  if(openCardRI===ri) renderLeadsGrid(ri);
  toast('Entry deleted','success');
}

function clearTodayLogs(){
  if(!confirm('Clear ALL of today\'s logged calls? This resets your dials and banks reached to 0. Your settings will not be affected.')) return;
  const savedConfig=localStorage.getItem(CONFIG_KEY);
  localStorage.clear();
  if(savedConfig) localStorage.setItem(CONFIG_KEY,savedConfig);
  window.location.reload();
}

async function deleteAllToday(ri, role){
  if(!confirm(`Delete ALL of today's logged entries for ${role} at this bank? This will also update the sheet.`)) return;
  const logs=todayLogs[ri]||[];
  logs.filter(l=>l.role===role).forEach(l=>l.deleted=true);
  saveTodayLogs();

  const bank=banks.find(b=>b._rowIndex===ri);
  if(bank){
    const c=CD[role];
    // Strip all today lines from notes
    const todayLines=logs.filter(l=>l.role===role).map(l=>l.noteEntry);
    const notes=(bank.data[c.notes]||'').split('\n').filter(l=>!todayLines.includes(l)).join('\n');
    bank.data[c.notes]=notes;
    // Recalculate times
    const todayCount=logs.filter(l=>l.role===role).length;
    bank.data[c.times]=String(Math.max(0,(parseInt(bank.data[c.times])||0)-todayCount));
    await writeLeadToSheet(ri,role,bank);
  }

  renderStats();
  if(openCardRI===ri) renderLeadsGrid(ri);
  toast('All entries cleared','success');
}

// ── SHEET WRITE HELPERS ──────────────────
async function writeLeadToSheet(ri, role, bank){
  if(!config.oauthToken) return;
  const c=CD[role], d=bank.data;
  const writes=[
    {col:c.recentCall, val:d[c.recentCall]||''},
    {col:c.times,      val:d[c.times]||'0'},
    {col:c.outcome,    val:d[c.outcome]||''},
    {col:c.who,        val:d[c.who]||''},
    {col:c.notes,      val:d[c.notes]||''},
  ];
  for(const w of writes) await writeCell(ri, w.col, w.val);
}

async function writeCell(ri, colIndex, value){
  if(!config.oauthToken) return;
  const cellRef=`'${config.tabName}'!${colToLetter(colIndex)}${ri}`;
  try{
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodeURIComponent(cellRef)}?valueInputOption=USER_ENTERED`,
      { method:'PUT',
        headers:{'Authorization':`Bearer ${config.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({range:cellRef, majorDimension:'ROWS', values:[[value]]})
      }
    );
  }catch(e){ console.error('Sheet write error',e); }
}

function flagForTressika(){
  const ri=currentModal?.rowIndex;
  const logs=todayLogs[ri];
  const active=logs?.filter(l=>!l.deleted);
  if(active?.length) active[active.length-1].forTressika=true;
  saveTodayLogs(); renderStats();
  if(openCardRI===ri) renderLeadsGrid(ri);
  toast('Flagged for Tressika ✓','success');
  closeModal();
}

function rebuildCard(ri, removeFromList){
  const bank=banks.find(b=>b._rowIndex===ri);
  const old=document.getElementById(`bank-card-${ri}`);
  if(!old) return;
  if(removeFromList&&gv('filter-status')!=='declined'){ old.remove(); return; }
  const nc=buildBankCard(bank); old.replaceWith(nc);
  const nb=document.getElementById(`body-${ri}`);
  if(nb){ nb.classList.add('open'); document.getElementById(`chev-${ri}`)?.classList.add('open'); renderLeadsGrid(ri); }
}

// ── EOD REPORT ───────────────────────────
function showEOD(){
  const all=Object.values(todayLogs).flat().filter(l=>!l.deleted);
  const dials=all.length;
  const banksReached=new Set(
    all.filter(l=>l.outcome!=='No Answer')
       .map(l=>l.rowIndex)
  ).size;
  const outcomeCounts={};
  all.forEach(l=>{outcomeCounts[l.outcome]=(outcomeCounts[l.outcome]||0)+1;});

  const seenT=new Set(), tressikaDetails=[];
  all.filter(l=>l.forTressika||l.outcome==='Expressed Interest'||l.outcome==='Email requested/ Follow-up').forEach(l=>{
    const key=`${l.rowIndex}-${l.role}`;
    if(!seenT.has(key)){seenT.add(key);
      const b=banks.find(x=>x._rowIndex===l.rowIndex);
      if(b) tressikaDetails.push({row:l.rowIndex,bank:b.data[COL.BANK_NAME],role:l.role,who:l.spokeTo||l.who||l.role,outcome:l.outcome});
    }
  });

  // SOS from flags
  const sosDetails=[];
  banks.forEach(b=>{
    ['CEO','CRA','CFO'].forEach(r=>{
      getFlagsForRole(b._rowIndex,r).filter(f=>!f.undone).forEach(f=>{
        sosDetails.push({row:b._rowIndex,bank:b.data[COL.BANK_NAME],role:r,phone:f.phone,issue:f.issue});
      });
    });
  });

  const declinedDetails=[];
  all.filter(l=>l.outcome==='Decline').forEach(l=>{
    const b=banks.find(x=>x._rowIndex===l.rowIndex);
    if(b) declinedDetails.push({row:l.rowIndex,bank:b.data[COL.BANK_NAME],role:l.role,who:l.who,time:l.timestamp});
  });

  const attentionDetails=[];
  banks.filter(b=>!isBankDeclined(b._rowIndex)).forEach(b=>{
    ['CEO','CRA','CFO'].forEach(r=>{
      const {unconfirmed,confirmed}=getLeadCounters(b._rowIndex,r);
      if(unconfirmed>=2) attentionDetails.push({row:b._rowIndex,bank:b.data[COL.BANK_NAME],role:r,type:`${unconfirmed}x no answer / no VM`});
      if(confirmed>=7)   attentionDetails.push({row:b._rowIndex,bank:b.data[COL.BANK_NAME],role:r,type:`${confirmed}x confirmed attempts`});
    });
  });

  setText('eod-date',`${config.repName||'Rep'} · ${formatDateLong(TODAY)}`);
  const emailText=buildEmailText(dials,banksReached,tressikaDetails,sosDetails,declinedDetails,attentionDetails);

  document.getElementById('eod-content').innerHTML=`
    <div class="eod-stats">
      <div class="eod-stat"><div class="eod-stat-val">${dials}</div><div class="eod-stat-label">Total dials</div></div>
      <div class="eod-stat"><div class="eod-stat-val" style="color:var(--green)">${banksReached}</div><div class="eod-stat-label">Banks reached</div></div>
      <div class="eod-stat"><div class="eod-stat-val" style="color:var(--blue)">${tressikaDetails.length}</div><div class="eod-stat-label">→ Tressika</div></div>
      <div class="eod-stat"><div class="eod-stat-val" style="color:var(--red)">${sosDetails.length}</div><div class="eod-stat-label">SOS flags</div></div>
    </div>
    ${Object.keys(outcomeCounts).length?`<div class="eod-section"><div class="eod-section-title">Outcome breakdown</div>
      <table class="eod-table"><thead><tr><th>Outcome</th><th>Count</th></tr></thead><tbody>
      ${Object.entries(outcomeCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}
      </tbody></table></div>`:''}
    ${tressikaDetails.length?`<div class="eod-section"><div class="eod-section-title">Connects for Tressika</div>
      <table class="eod-table"><thead><tr><th>Row</th><th>Bank</th><th>Who</th><th>Outcome</th></tr></thead><tbody>
      ${tressikaDetails.map(t=>`<tr><td>${t.row}</td><td>${esc(t.bank)}</td><td>${esc(t.who)} (${t.role})</td><td>${esc(t.outcome)}</td></tr>`).join('')}
      </tbody></table></div>`:''}
    ${sosDetails.length?`<div class="eod-section"><div class="eod-section-title">SOS flags — bad numbers</div>
      <table class="eod-table"><thead><tr><th>Row</th><th>Bank</th><th>Lead</th><th>Number</th><th>Issue</th></tr></thead><tbody>
      ${sosDetails.map(s=>`<tr><td>${s.row}</td><td>${esc(s.bank)}</td><td>${s.role}</td><td style="text-decoration:line-through;color:var(--red)">${esc(s.phone)}</td><td>${esc(s.issue)}</td></tr>`).join('')}
      </tbody></table></div>`:''}
    ${declinedDetails.length?`<div class="eod-section"><div class="eod-section-title">Banks declined today</div>
      <table class="eod-table"><thead><tr><th>Row</th><th>Bank</th><th>Declined by</th><th>Time</th></tr></thead><tbody>
      ${declinedDetails.map(x=>`<tr><td>${x.row}</td><td>${esc(x.bank)}</td><td>${x.role} (${esc(x.who)})</td><td>${x.time}</td></tr>`).join('')}
      </tbody></table></div>`:''}
    ${attentionDetails.length?`<div class="eod-section"><div class="eod-section-title">⚠️ Leads requiring team attention</div>
      <table class="eod-table"><thead><tr><th>Row</th><th>Bank</th><th>Lead</th><th>Issue</th></tr></thead><tbody>
      ${attentionDetails.map(a=>`<tr><td>${a.row}</td><td>${esc(a.bank)}</td><td>${a.role}</td><td>${esc(a.type)}</td></tr>`).join('')}
      </tbody></table></div>`:''}
    <div class="eod-section"><div class="eod-section-title">Copy-ready email</div>
      <pre id="email-text-copy" class="eod-email-preview">${esc(emailText)}</pre>
    </div>`;
  document.getElementById('eod-modal').classList.remove('hidden');
}

function buildEmailText(dials,reached,tressikaDetails,sosDetails,declinedDetails,attentionDetails){
  let t=`Team,\n\nEnd of day summary — ${formatDateLong(TODAY)}\n\n`;
  t+=`Total dials: ${dials}\nBanks reached: ${reached}\nConnects passed to Tressika: ${tressikaDetails.length}\nSOS flags: ${sosDetails.length}\nBanks declined: ${declinedDetails.length}\n\n`;
  if(tressikaDetails.length){t+=`Connects for Tressika\n`;tressikaDetails.forEach((x,i)=>{t+=`${i+1}. ${x.bank} - ${x.who} (${x.role}, Row ${x.row}) - ${x.outcome}\n`;});t+='\n';}
  if(sosDetails.length){t+=`SOS flags - numbers requiring update\n`;sosDetails.forEach(s=>{t+=`Row ${s.row} - ${s.bank} (${s.role}): ${s.phone} - ${s.issue}\n`;});t+='\n';}
  if(declinedDetails.length){t+=`Banks declined today\n`;declinedDetails.forEach(x=>{t+=`Row ${x.row} - ${x.bank} — declined by ${x.role} at ${x.time}\n`;});t+='\n';}
  if(attentionDetails.length){t+=`Leads requiring team attention\n`;attentionDetails.forEach(a=>{t+=`Row ${a.row} - ${a.bank} (${a.role}): ${a.type}\n`;});t+='\n';}
  t+=config.repName||'Rep';
  return t;
}

function copyEOD(){
  const el=document.getElementById('email-text-copy');
  if(!el) return;
  navigator.clipboard.writeText(el.textContent).then(()=>toast('Email copied ✓','success')).catch(()=>toast('Select the text and copy manually','error'));
}
function closeEOD(){ document.getElementById('eod-modal').classList.add('hidden'); }

// ── SETTINGS ─────────────────────────────
function showSettings(){
  setVal('settings-rep-name',config.repName||''); setVal('settings-sheet-id',config.sheetId||'');
  setVal('settings-tab-name',config.tabName||''); setVal('settings-api-key',config.apiKey||'');
  setVal('settings-tressika-email',config.tressikaEmail||''); setVal('settings-team-email',config.teamEmail||'');
  setVal('settings-client-id',config.googleClientId||'');
  updateAuthStatus();
  document.getElementById('settings-modal').classList.remove('hidden');
}
function closeSettings(){ document.getElementById('settings-modal').classList.add('hidden'); }
function saveSettings(){
  config.repName=gv('settings-rep-name'); config.sheetId=gv('settings-sheet-id').trim();
  config.tabName=gv('settings-tab-name').trim(); config.apiKey=gv('settings-api-key').trim();
  config.tressikaEmail=gv('settings-tressika-email').trim(); config.teamEmail=gv('settings-team-email').trim();
  config.googleClientId=gv('settings-client-id').trim();
  saveConfig(); closeSettings(); setText('rep-name-badge',config.repName);
  toast('Settings saved — reloading...','success'); setTimeout(()=>loadSheet(),600);
}

// ── OAUTH ─────────────────────────────────
function signInGoogle(){
  const clientId=config.googleClientId||'';
  if(!clientId){ toast('Please add your Google Client ID in Settings first','error'); return; }
  const redirect=encodeURIComponent(window.location.href.split('#')[0]);
  const scope=encodeURIComponent('https://www.googleapis.com/auth/spreadsheets');
  window.location.href=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=token&scope=${scope}&prompt=consent`;
}
function signInFromSettings(){
  closeSettings();
  signInGoogle();
}
function signOut(){
  config.oauthToken=null;
  config.signedInEmail='';
  saveConfig();
  updateAuthStatus();
  toast('Signed out','success');
}
function updateAuthStatus(){
  const statusEl=document.getElementById('auth-status');
  const signoutBtn=document.getElementById('btn-signout');
  const signinBtn=document.getElementById('btn-signin-settings');
  if(!statusEl) return;
  if(config.oauthToken){
    statusEl.textContent='● Signed in'+(config.signedInEmail?' as '+config.signedInEmail:'')+' — write-back active';
    statusEl.style.color='var(--green)';
    signoutBtn?.classList.remove('hidden');
    signinBtn?.classList.add('hidden');
  } else {
    statusEl.textContent='● Not signed in — read only mode';
    statusEl.style.color='var(--text3)';
    signoutBtn?.classList.add('hidden');
    signinBtn?.classList.remove('hidden');
  }
}
function skipAuth(){ showScreen('main-app'); initApp(); }
function checkOAuthCallback(){
  if(window.location.hash.includes('access_token')){
    const p=new URLSearchParams(window.location.hash.substring(1));
    const token=p.get('access_token');
    if(token){
      config=loadConfig(); // reload config fresh
      config.oauthToken=token;
      saveConfig();
      // Clear hash without reload
      history.replaceState(null,'',window.location.pathname+window.location.search);
      // Show main app with token active
      showScreen('main-app');
      initApp();
    }
  }
}

// ── UTILS ─────────────────────────────────
function showScreen(id){
  ['setup-screen','auth-screen','main-app'].forEach(s=>{
    const el=document.getElementById(s); if(el) el.classList.toggle('hidden',s!==id);
  });
}
function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function gv(id)      { return document.getElementById(id)?.value||''; }
function setVal(id,v){ const el=document.getElementById(id); if(el) el.value=v||''; }
function setText(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }
function esc(s)      { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// ── TIMEZONE ─────────────────────────────
function formatDateET(d){
  return d.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric'});
}
function formatDateLongET(d){
  return d.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'});
}
function formatDateTimeET(d){
  const date=d.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric'});
  const time=d.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit'});
  return `${date} ${time} ET`;
}
function formatDate(d){ return d.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'numeric'}); }
function formatDateLong(d){ return formatDateLongET(d); }
function formatDateTime(d){ return formatDateTimeET(d); }
function fmtD(v){ if(!v)return''; try{const d=new Date(v);return isNaN(d)?String(v):`${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;}catch{return String(v);} }
function toast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className=`toast${type?' '+type:''}`;
  el.classList.remove('hidden'); setTimeout(()=>el.classList.add('hidden'),2500);
}
function loadConfig()   { try{return JSON.parse(localStorage.getItem(CONFIG_KEY))||{};}catch{return{};} }
function saveConfig()   { localStorage.setItem(CONFIG_KEY,JSON.stringify(config)); }
function loadTodayLogs(){
  try{
    const s=JSON.parse(localStorage.getItem(LOGS_KEY))||{};
    const today=formatDate(new Date());
    // New day — auto clear
    if(s._date!==today){
      const fresh={_date:today, _session:SESSION_ID};
      localStorage.setItem(LOGS_KEY,JSON.stringify(fresh));
      return fresh;
    }
    // Same day but different session — clear logs but keep date
    if(s._session && s._session!==SESSION_ID){
      const fresh={_date:today, _session:SESSION_ID};
      localStorage.setItem(LOGS_KEY,JSON.stringify(fresh));
      return fresh;
    }
    // Same session — return as is
    s._session=SESSION_ID;
    return s;
  }catch{ return{_date:formatDate(new Date()),_session:SESSION_ID}; }
}
function saveTodayLogs(){ todayLogs._date=formatDate(new Date()); localStorage.setItem(LOGS_KEY,JSON.stringify(todayLogs)); }

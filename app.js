'use strict';

const storageKey = 'ldi-data-v1';
const categories = {
  Momento: ['Mattina', 'Pomeriggio', 'Sera', 'Giornata intera'],
  Stagione: ['Primavera', 'Estate', 'Autunno', 'Inverno'],
  Ambiente: ['Al chiuso', 'All’aperto']
};
const allTags = Object.values(categories).flat();
const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const sessions = new Map();
let data = { version: 1, groups: [] };
let groupId = null;
let page = 'draw';
let editor = null;
let filtersOpen = false;
let readable = true;

function validate(value) {
  const validText = (text, max) => typeof text === 'string' && text.trim() && text.length <= max;
  function unique(records, valid) {
    return Array.isArray(records) && records.every(record => record &&
      validText(record.id, 100) && valid(record)) &&
      new Set(records.map(record => record.id)).size === records.length;
  }
  if (value?.version !== 1 || !unique(value.groups, group =>
    validText(group.name, 80) && unique(group.activities, activity =>
      validText(activity.name, 120) && typeof activity.description === 'string' &&
      activity.description.length <= 2000 && typeof activity.done === 'boolean' &&
      Array.isArray(activity.tags) && activity.tags.every(tag => allTags.includes(tag)) &&
      Array.isArray(activity.history) && activity.history.every(date =>
        typeof date === 'string' && Number.isFinite(Date.parse(date))) &&
      (!activity.done || activity.history.length > 0)))) {
    throw new Error('Backup non valido o di una versione incompatibile.');
  }
  return value;
}

try {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) data = validate(JSON.parse(saved));
} catch {
  readable = false;
  notify('Impossibile leggere i dati locali. Puoi ripristinarli da un backup.');
}

function notify(message = '') {
  notice.textContent = message;
}

function save(change, restore = false) {
  if (!readable && !restore) {
    notify('Ripristina un backup prima di salvare nuovi dati.');
    return false;
  }
  try {
    const next = JSON.parse(JSON.stringify(data));
    change(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    data = next;
    readable = true;
    notify();
    return true;
  } catch {
    notify('Salvataggio non riuscito. Verifica lo spazio disponibile e riprova.');
    return false;
  }
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function button(label, action, id = '', style = '') {
  return `<button type="button" class="${style}" data-action="${action}" data-id="${escape(id)}">${label}</button>`;
}

function group() {
  return data.groups.find(item => item.id === groupId);
}

function session() {
  if (!sessions.has(groupId)) sessions.set(groupId, {
    include: [], exclude: [], seen: new Set(), picked: null
  });
  return sessions.get(groupId);
}

function eligible(activities, current) {
  return activities.filter(activity => !activity.done &&
    !current.exclude.some(tag => activity.tags.includes(tag)) &&
    Object.entries(categories).every(([category, tags]) => {
      const wanted = current.include.filter(tag => tags.includes(tag));
      return !wanted.length || wanted.some(tag => activity.tags.includes(tag)) ||
        (category === 'Stagione' && !tags.some(tag => activity.tags.includes(tag)));
    }));
}

function checkboxes(name, selected) {
  return Object.entries(categories).map(([category, tags]) => `
    <fieldset><legend>${category}</legend><div class="chips">
      ${tags.map(tag => `<label class="chip"><input type="checkbox" name="${name}"
        value="${escape(tag)}" ${selected.includes(tag) ? 'checked' : ''}>${tag}</label>`).join('')}
    </div></fieldset>`).join('');
}

function activityCard(activity, mode) {
  const dates = activity.history.slice().reverse().map(date =>
    new Date(date).toLocaleDateString('it-IT', { dateStyle: 'long' }));
  return `<article class="${mode === 'result' ? 'result' : ''}">
    <h2>${escape(activity.name)}</h2>
    ${activity.description ? `<p class="description">${escape(activity.description)}</p>` : ''}
    ${activity.tags.length ? `<div class="chips tags">${activity.tags.map(tag =>
      `<span class="tag">${escape(tag)}</span>`).join('')}</div>` : ''}
    ${mode === 'history' ? `<p class="muted">${activity.done ? 'Completata' : 'Di nuovo estraibile'}</p>
      <ul>${dates.map(date => `<li>${date}</li>`).join('')}</ul>
      ${activity.done ? button('Rivivi', 'revive', activity.id) : ''}` :
      `<div class="row">${button('Segna come fatta', 'complete', activity.id)}
      ${mode === 'list' ? button('Modifica', 'edit', activity.id) : ''}</div>`}
    </article>`;
}

function home() {
  return `<h1>Con chi?</h1>
    ${data.groups.map(item => `<article class="row">
      ${button(escape(item.name), 'open', item.id, 'grow')}
      ${button('Rinomina', 'rename', item.id)}
    </article>`).join('')}
    ${editor?.kind === 'group' ? groupForm() : button('+ Nuovo gruppo', 'new-group', '', 'primary wide')}
    <footer><details><summary>Backup</summary><div class="row">
      ${readable ? button('Esporta backup', 'export') : ''}
      <label class="button" for="backup">Importa backup</label>
      <input hidden type="file" id="backup" accept=".json,application/json">
    </div></details></footer>`;
}

function groupForm() {
  return `<form id="group-form"><label class="field">Nome del gruppo
    <input name="name" maxlength="80" required value="${escape(editor.name)}">
    </label><div class="row"><button class="primary">Salva gruppo</button>
    ${button('Annulla', 'cancel')}</div></form>`;
}

function activityForm(activity = { name: '', description: '', tags: [] }) {
  return `<form id="activity-form"><label class="field">Nome
    <input name="name" maxlength="120" required value="${escape(activity.name)}"></label>
    <label class="field">Descrizione
    <textarea name="description" rows="3" maxlength="2000">${escape(activity.description)}</textarea></label>
    ${checkboxes('tags', activity.tags)}<div class="row"><button class="primary">Salva attività</button>
    ${button('Annulla', 'cancel')}</div></form>`;
}

function drawPanel(activities) {
  const current = session();
  const pool = eligible(activities, current);
  const remaining = pool.filter(item => !current.seen.has(item.id));
  const picked = pool.find(item => item.id === current.picked);
  return `<details id="filters" ${filtersOpen ? 'open' : ''}><summary>Filtri</summary>
    <h3>Includi</h3><p class="muted">Nello stesso campo basta una corrispondenza. Senza stagione, l’attività vale tutto l’anno.</p>
    ${checkboxes('include', current.include)}
    <h3>Escludi</h3>${checkboxes('exclude', current.exclude)}
    ${button('Azzera filtri', 'clear-filters')}</details>
    <div id="draw-result" aria-live="polite">${drawResult(pool, remaining, picked, current)}</div>`;
}

function drawResult(pool, remaining, picked, current) {
  return `<p class="muted">Compatibili: ${pool.length} · Da estrarre: ${remaining.length}</p>
    ${picked ? activityCard(picked, 'result') : ''}
    ${remaining.length ? button(current.seen.size ? 'Estrai di nuovo' : 'Estrai', 'draw', '', 'primary wide') :
      pool.length ? button('Ricomincia le estrazioni', 'restart', '', 'primary wide') :
      '<p>Non ci sono attività compatibili. Cambia i filtri o aggiungi una proposta.</p>'}`;
}

function render() {
  const activeGroup = group();
  if (!activeGroup) {
    app.innerHTML = home();
    return;
  }
  const activities = activeGroup.activities;
  let content;
  if (page === 'draw') content = drawPanel(activities);
  if (page === 'activities') {
    const list = activities.filter(item => !item.done);
    content = editor ? activityForm(activities.find(item => item.id === editor.id)) :
      button('+ Nuova attività', 'new-activity', '', 'primary wide');
    content += list.length ? list.map(item => activityCard(item, 'list')).join('') :
      '<p class="muted">Nessuna attività disponibile.</p>';
  }
  if (page === 'history') {
    const list = activities.filter(item => item.history.length).sort((a, b) =>
      b.history.at(-1).localeCompare(a.history.at(-1)));
    content = list.length ? list.map(item => activityCard(item, 'history')).join('') :
      '<article>Nessuna attività completata.</article>';
  }
  app.innerHTML = `${button('‹ Cambia gruppo', 'home')}<h1>${escape(activeGroup.name)}</h1>
    <nav aria-label="Sezioni">${Object.entries({ draw: 'Estrai', activities: 'Attività', history: 'Completate' })
      .map(([id, label]) => `<button type="button" data-action="page" data-id="${id}"
        ${id === page ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>${content}`;
}

function updateActivity(id, change) {
  return save(next => change(next.groups.find(item => item.id === groupId)
    .activities.find(item => item.id === id)));
}

app.addEventListener('click', event => {
  const control = event.target.closest('button[data-action]');
  if (!control) return;
  const { action, id } = control.dataset;
  switch (action) {
    case 'open':
      groupId = id;
      editor = null;
      page = 'draw';
      filtersOpen = false;
      break;
    case 'home':
      groupId = null;
      editor = null;
      break;
    case 'page':
      page = id;
      editor = null;
      break;
    case 'new-group':
      editor = { kind: 'group', name: '' };
      break;
    case 'rename':
      editor = { kind: 'group', id, name: data.groups.find(item => item.id === id).name };
      break;
    case 'new-activity':
    case 'edit':
      editor = { kind: 'activity', id };
      break;
    case 'cancel':
      editor = null;
      break;
    case 'clear-filters':
      Object.assign(session(), { include: [], exclude: [], seen: new Set(), picked: null });
      break;
    case 'restart':
      session().seen.clear();
      session().picked = null;
      break;
    case 'draw': {
      const current = session();
      const pool = eligible(group().activities, current).filter(item => !current.seen.has(item.id));
      if (!pool.length) return;
      current.picked = pool[Math.floor(Math.random() * pool.length)].id;
      current.seen.add(current.picked);
      break;
    }
    case 'complete':
    case 'revive': {
      const activity = group().activities.find(item => item.id === id);
      if (!activity || activity.done !== (action === 'revive')) return;
      if (!updateActivity(id, item => {
        item.done = action === 'complete';
        if (item.done) item.history.push(new Date().toISOString());
      })) return;
      if (session().picked === id) session().picked = null;
      if (action === 'revive') session().seen.delete(id);
      notify(action === 'revive' ? 'Attività di nuovo estraibile.' : 'Attività completata.');
      break;
    }
    case 'export': {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'LDI-backup.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return;
    }
  }
  render();
  if (['new-group', 'rename', 'new-activity', 'edit'].includes(action)) {
    app.querySelector('input[name="name"]')?.focus();
  }
});

app.addEventListener('toggle', event => {
  if (event.target.id === 'filters' && event.target.isConnected) filtersOpen = event.target.open;
}, true);

app.addEventListener('change', async event => {
  const input = event.target;
  if (input.id === 'backup') {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    try {
      const imported = validate(JSON.parse(await file.text()));
      if ((data.groups.length || !readable) &&
          !confirm('Sostituire tutti i gruppi e lo storico locali con quelli del backup?')) return;
      if (!save(next => { next.groups = imported.groups; }, true)) return;
      sessions.clear();
      groupId = null;
      editor = null;
      notify('Backup ripristinato.');
      render();
    } catch {
      notify('Impossibile importare il file. Seleziona un backup JSON valido di LDI.');
    }
    return;
  }
  if (!['include', 'exclude'].includes(input.name)) return;
  const current = session();
  current[input.name] = [...app.querySelectorAll(`input[name="${input.name}"]:checked`)].map(item => item.value);
  current.seen.clear();
  current.picked = null;
  const pool = eligible(group().activities, current);
  app.querySelector('#draw-result').innerHTML = drawResult(pool, pool, null, current);
});

app.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const name = form.get('name').trim();
  if (!name) {
    notify('Inserisci un nome.');
    return;
  }
  if (event.target.id === 'group-form') {
    if (data.groups.some(item => item.id !== editor.id &&
        item.name.localeCompare(name, 'it', { sensitivity: 'accent' }) === 0)) {
      notify('Esiste già un gruppo con questo nome.');
      return;
    }
    if (!save(next => {
      if (editor.id) next.groups.find(item => item.id === editor.id).name = name;
      else next.groups.push({ id: crypto.randomUUID(), name, activities: [] });
    })) return;
  } else {
    const values = { name, description: form.get('description').trim(), tags: form.getAll('tags') };
    if (!save(next => {
      const list = next.groups.find(item => item.id === groupId).activities;
      if (editor.id) Object.assign(list.find(item => item.id === editor.id), values);
      else list.unshift({ id: crypto.randomUUID(), ...values, done: false, history: [] });
    })) return;
  }
  editor = null;
  render();
});

render();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    notify('Avvio offline non disponibile. Riapri LDI con una connessione.');
  });
}

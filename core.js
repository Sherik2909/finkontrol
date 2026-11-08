'use strict';
/* =========================================================
   ФинКонтроль — ядро: данные, хранение, расчёты (v2.5 Pro).
   Все данные хранятся локально на устройстве (localStorage).
   ========================================================= */

const KEY = 'finkontrol_v1';
const APP_VER = '2.5';
const MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const DAY_FORMS = ['день','дня','дней'];
const MONTH_FORMS = ['месяц','месяца','месяцев'];
const CURRENCIES = [['₽','Рубль ₽'],['₸','Тенге ₸'],['сум','Сум (UZS)'],['сом','Сом (KGS)'],['с.','Сомони (TJS)'],['₴','Гривна ₴'],['Br','Бел. рубль'],['$','Доллар $'],['€','Евро €']];
const DEBT_KINDS = {
  credit:      { n: 'Потребкредит',     i: '🏦' },
  mortgage:    { n: 'Ипотека',          i: '🏠' },
  auto:        { n: 'Автокредит',       i: '🚗' },
  card:        { n: 'Кредитная карта',  i: '💳' },
  installment: { n: 'Рассрочка',        i: '🧾' },
  micro:       { n: 'Микрозайм',        i: '⚡' },
  personal:    { n: 'Долг человеку',    i: '🤝' },
  tax:         { n: 'Налог / штраф',    i: '📄' },
  lent:        { n: 'Мне должны',       i: '💸' },
};
const COLORS = ['#4f8cff','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6','#eab308','#6366f1','#64748b','#f43f5e','#0ea5e9','#d946ef'];
const EMOJIS = '🛒 🍔 ☕ 🪙 🚌 🚕 ⛽ 📱 💡 🔑 💊 👕 🧴 🎮 📺 🚬 🎁 🧸 💇 📚 🏦 📦 💼 💵 🛠 🤝 ➕ 🏠 🚗 ✈️ 🐶 🍺 🎬 ⚽ 💻 🧾 💳 🎓 🍼 💍 🔧 🌿 🥩 🍞 🧃 🏥 🦷 👟 🎧 🕌 ⛪ 🎉 🏖 📈 🐷 💰'.split(' ');
const SYSTEM_CATS = ['c_debt', 'c_debtin', 'c_other', 'c_other_in'];

function defaultState() {
  const c = (id, name, icon, color, type = 'expense') => ({ id, name, icon, color, type });
  return {
    version: 3,
    settings: { currency: '₽', theme: 'dark', onboarded: false, pin: '', lastBackup: null, smallLimit: 500, lastAccount: '', startDismissed: false },
    accounts: [
      { id: 'a_card', name: 'Карта', icon: '💳', initial: 0, inTotal: true },
      { id: 'a_cash', name: 'Наличные', icon: '💵', initial: 0, inTotal: true },
    ],
    categories: [
      c('c_food', 'Продукты', '🛒', '#22c55e'),
      c('c_cafe', 'Кафе, фастфуд', '🍔', '#f97316'),
      c('c_small', 'Мелочи: вода, снеки', '🪙', '#eab308'),
      c('c_transport', 'Транспорт', '🚌', '#06b6d4'),
      c('c_taxi', 'Такси', '🚕', '#facc15'),
      c('c_car', 'Авто, бензин', '⛽', '#64748b'),
      c('c_phone', 'Связь, интернет', '📱', '#6366f1'),
      c('c_home', 'Коммуналка', '💡', '#14b8a6'),
      c('c_rent', 'Аренда жилья', '🔑', '#0ea5e9'),
      c('c_health', 'Здоровье, аптека', '💊', '#ef4444'),
      c('c_clothes', 'Одежда, обувь', '👕', '#a855f7'),
      c('c_house', 'Дом и быт', '🧴', '#84cc16'),
      c('c_fun', 'Развлечения', '🎮', '#ec4899'),
      c('c_subs', 'Подписки', '📺', '#8b5cf6'),
      c('c_bad', 'Сигареты, алкоголь', '🚬', '#78716c'),
      c('c_gifts', 'Подарки', '🎁', '#f43f5e'),
      c('c_kids', 'Дети', '🧸', '#fb923c'),
      c('c_beauty', 'Красота', '💇', '#d946ef'),
      c('c_edu', 'Образование', '📚', '#3b82f6'),
      c('c_debt', 'Кредиты и долги', '🏦', '#dc2626'),
      c('c_other', 'Прочее', '📦', '#94a3b8'),
      c('c_salary', 'Зарплата', '💼', '#22c55e', 'income'),
      c('c_advance', 'Аванс', '💵', '#10b981', 'income'),
      c('c_side', 'Подработка', '🛠', '#06b6d4', 'income'),
      c('c_debtin', 'Возврат долга', '🤝', '#a855f7', 'income'),
      c('c_gift_in', 'Подарки, помощь', '🎁', '#f59e0b', 'income'),
      c('c_other_in', 'Прочие доходы', '➕', '#94a3b8', 'income'),
    ],
    transactions: [],
    debts: [],
    incomes: [],
    bills: [],
    budgets: {},
    goals: [],
    planMarks: {},
  };
}

function migrate(s) {
  const d = defaultState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.settings = Object.assign({}, d.settings, s.settings);
  if (!s.planMarks || typeof s.planMarks !== 'object') s.planMarks = {};
  return s;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return defaultState();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { alert('Не удалось сохранить данные: ' + e.message); }
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ---------- utils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const r2 = n => Math.round((n || 0) * 100) / 100;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sum = (arr, key) => arr.reduce((s, x) => s + (key ? (+x[key] || 0) : (+x || 0)), 0);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const num = v => { const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : 0; };
function calc(v) {
  const s = String(v ?? '').replace(/\s/g, '').replace(/,/g, '.');
  if (!s) return 0;
  if (/^[\d.+\-*/()]+$/.test(s)) {
    try { const x = Function('"use strict";return (' + s + ')')(); if (isFinite(x)) return x; } catch (e) { /* ignore */ }
  }
  return num(s);
}
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const money = n => nf.format(r2(n)) + '\u00A0' + S.settings.currency;
const moneyShort = n => {
  const a = Math.abs(n);
  if (a >= 1e6) return nf.format(Math.round(n / 1e5) / 10) + ' млн';
  if (a >= 1e4) return nf.format(Math.round(n / 100) / 10) + ' тыс';
  return nf.format(Math.round(n));
};
function plural(n, f) {
  n = Math.abs(Math.trunc(n)) % 100; const n1 = n % 10;
  if (n > 10 && n < 20) return f[2];
  if (n1 > 1 && n1 < 5) return f[1];
  if (n1 === 1) return f[0];
  return f[2];
}
function toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
const todayStr = () => toISO(new Date());
const ym = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const dim = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
function fmtDate(iso) {
  const d = parseISO(iso);
  return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}
function fmtDayHead(iso) {
  const t = todayStr();
  if (iso === t) return 'Сегодня';
  if (iso === toISO(addDays(new Date(), -1))) return 'Вчера';
  const d = parseISO(iso);
  return cap(d.toLocaleDateString('ru-RU', { weekday: 'short' })) + ', ' + fmtDate(iso);
}
const fmtMonthYear = d => MONTHS[d.getMonth()] + ' ' + d.getFullYear();
function hashPin(p) { let h = 5381; const s = 'fk$' + p; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); }

/* ---------- lookups ---------- */
const cat = id => S.categories.find(c => c.id === id);
const acc = id => S.accounts.find(a => a.id === id);
const accName = id => { const a = acc(id); return a ? a.icon + ' ' + a.name : '—'; };
const debtById = id => S.debts.find(d => d.id === id);

/* ---------- balances ---------- */
function balances() {
  const b = {};
  S.accounts.forEach(a => b[a.id] = +a.initial || 0);
  for (const t of S.transactions) {
    if (t.type === 'income') { if (t.accountId in b) b[t.accountId] += t.amount; }
    else if (t.type === 'expense') { if (t.accountId in b) b[t.accountId] -= t.amount; }
    else if (t.type === 'transfer') {
      if (t.accountId in b) b[t.accountId] -= t.amount;
      if (t.toAccountId in b) b[t.toAccountId] += t.amount;
    }
  }
  for (const k in b) b[k] = r2(b[k]);
  return b;
}
function totalBalance(b = balances()) { return r2(S.accounts.filter(a => a.inTotal !== false).reduce((s, a) => s + (b[a.id] || 0), 0)); }

/* ---------- плановые отметки (выполнено в месяце) ---------- */
function isPlanDone(key, ymStr) {
  if (S.planMarks && S.planMarks[key + '|' + ymStr]) return true;
  if (S.transactions.some(t => t.plan === key && t.date.slice(0, 7) === ymStr)) return true;
  if (key.startsWith('debt:')) {
    const dId = key.slice(5);
    if (S.transactions.some(t => t.debtId === dId && t.date.slice(0, 7) === ymStr)) return true;
  }
  return false;
}
function setPlanMark(key, ymStr, val) {
  if (!S.planMarks) S.planMarks = {};
  const k = key + '|' + ymStr;
  if (val) S.planMarks[k] = true;
  else delete S.planMarks[k];
}

/* ---------- debts ---------- */
function debtPaidPrincipal(id) {
  let p = 0;
  for (const t of S.transactions) if (t.debtId === id) p += (t.principal != null ? t.principal : t.amount);
  return p;
}
function debtRemaining(d) { return Math.max(0, r2((+d.base || 0) - debtPaidPrincipal(d.id))); }

function payoff(bal, ratePct, pay, calcMode = 'fixed') {
  if (bal <= 0) return { months: 0, interest: 0 };
  if (!(pay > 0)) return null;

  const useBankRate = calcMode === 'bank' && (+ratePct || 0) > 0;
  const r = useBankRate ? (+ratePct || 0) / 1200 : 0;

  if (r === 0) {
    const exact = bal / pay;
    const whole = Math.floor(exact);
    const tail = exact - whole;
    const months = whole === 0 ? 1 : (tail <= 0.15 ? whole : whole + 1);
    return { months, interest: 0 };
  }

  let m = 0, int = 0, cur = bal;
  const tailThreshold = pay * 0.15;
  while (cur > 0.01 && m < 600) {
    const i = cur * r;
    if (pay <= i) return { never: true };
    int += i;
    cur = cur + i - pay;
    m++;
    if (cur > 0 && cur <= tailThreshold) {
      cur = 0;
      break;
    }
  }
  if (m >= 600) return { never: true };
  return { months: m, interest: r2(int) };
}

function annuity(B, ratePct, n) {
  const r = (+ratePct || 0) / 1200;
  if (n <= 0) return 0;
  if (!r) return B / n;
  return B * r / (1 - Math.pow(1 + r, -n));
}

function debtPayoffInfo(d) {
  const rem = debtRemaining(d);
  if (rem <= 0) return { months: 0, interest: 0, closedNow: true };
  const p = payoff(rem, d.rate, +d.payment || 0, d.calcMode || 'fixed');
  if (!p || p.never) return p;

  const now = new Date();
  const curYM = ym(now);
  const doneThisMonth = isPlanDone('debt:' + d.id, curYM);
  const startOffset = doneThisMonth ? 1 : 0;
  const last = addMonths(now, startOffset + p.months - 1);
  return Object.assign({}, p, {
    doneThisMonth,
    date: new Date(last.getFullYear(), last.getMonth(), Math.min(+d.payDay || 1, dim(last))),
  });
}

const activeOweDebts = () => S.debts.filter(d => !d.closed && d.kind !== 'lent' && debtRemaining(d) > 0);

function simulateAll(extra, strategy) {
  const list = activeOweDebts().filter(d => +d.payment > 0).map(d => {
    const useRate = d.calcMode === 'bank' ? (+d.rate || 0) : 0;
    return { id: d.id, name: d.name, bal: debtRemaining(d), r: useRate / 1200, pay: +d.payment || 0, rate: +d.rate || 0, closedAt: 0 };
  });
  if (!list.length) return { months: 0, interest: 0, order: [] };
  let month = 0, interest = 0; const order = [];
  while (list.some(x => x.bal > 0.01) && month < 600) {
    month++;
    let pool = extra;
    for (const x of list) {
      if (x.bal <= 0.01) { pool += x.pay; continue; }
      const i = x.bal * x.r; x.bal += i; interest += i;
      const p = Math.min(x.pay, x.bal); x.bal -= p; pool += x.pay - p;
      if (x.bal > 0 && x.bal <= x.pay * 0.15) x.bal = 0;
    }
    const active = list.filter(x => x.bal > 0.01);
    active.sort(strategy === 'avalanche' ? (a, b) => b.rate - a.rate || a.bal - b.bal : (a, b) => a.bal - b.bal || b.rate - a.rate);
    for (const x of active) {
      if (pool <= 0) break;
      const p = Math.min(pool, x.bal); x.bal -= p; pool -= p;
    }
    for (const x of list) if (x.bal <= 0.01 && !x.closedAt) { x.closedAt = month; order.push(x); }
  }
  if (month >= 600) return { never: true };
  return { months: month, interest: r2(interest), order };
}

/* ---------- ПОЛНЫЙ план на месяц (все долги, кредиты, счета и доходы) ---------- */
function planItems(monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth(), D = dim(monthDate), ymS = ym(monthDate);
  const mk = day => toISO(new Date(y, m, clamp(+day || 1, 1, D)));
  const out = [];

  // 1. Все активные доходы (ЗП, аванс и др.)
  S.incomes.filter(x => x.active !== false).forEach(x => {
    out.push({
      kind: 'income',
      key: 'inc:' + x.id,
      id: x.id,
      ref: x,
      name: x.name,
      icon: cat(x.categoryId)?.icon || '💼',
      amount: +x.amount || 0,
      date: mk(x.day),
      ym: ymS,
    });
  });

  // 2. Все обязательные счета (квартплата, связь, аренда и др.)
  S.bills.filter(x => x.active !== false).forEach(x => {
    out.push({
      kind: 'bill',
      key: 'bill:' + x.id,
      id: x.id,
      ref: x,
      name: x.name,
      icon: cat(x.categoryId)?.icon || '🧾',
      amount: +x.amount || 0,
      date: mk(x.day),
      ym: ymS,
    });
  });

  // 3. АБСОЛЮТНО ВСЕ активные долги и кредиты (даже если ежемесячный платёж не указан — тогда показывается остаток долга!)
  S.debts.filter(d => !d.closed && d.kind !== 'lent').forEach(d => {
    const rem = debtRemaining(d);
    const done = isPlanDone('debt:' + d.id, ymS);
    if (rem <= 0 && !done) return;
    const useRate = d.calcMode === 'bank' ? (+d.rate || 0) : 0;
    const hasMonthly = (+d.payment || 0) > 0;
    const due = hasMonthly
      ? (rem > 0 ? Math.min(+d.payment, r2(rem * (1 + useRate / 1200))) : +d.payment)
      : rem;
    const po = hasMonthly ? debtPayoffInfo(d) : null;
    out.push({
      kind: 'debt',
      key: 'debt:' + d.id,
      id: d.id,
      ref: d,
      name: d.name,
      icon: (DEBT_KINDS[d.kind] || DEBT_KINDS.credit).i,
      amount: due,
      rem,
      monthsLeft: po && !po.never ? po.months : null,
      noFixedPayment: !hasMonthly,
      date: mk(d.payDay || 25),
      ym: ymS,
    });
  });

  out.forEach(i => {
    i.done = isPlanDone(i.key, ymS);
    i.markedOnly = !!(S.planMarks && S.planMarks[i.key + '|' + ymS]);
  });

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'income' ? -1 : 1));
}

/** Главный прогноз: сколько свободно, сколько можно тратить в день */
function forecast() {
  const now = new Date(), today = todayStr();
  const b = balances(), total = totalBalance(b);
  const cur = planItems(now), nxt = planItems(addMonths(now, 1));
  const curUnpaid = cur.filter(i => !i.done);
  const oblMonth = r2(sum(curUnpaid.filter(i => i.kind !== 'income'), 'amount'));
  const incMonth = r2(sum(curUnpaid.filter(i => i.kind === 'income'), 'amount'));
  const all = curUnpaid.concat(nxt.filter(i => !i.done));
  const nextInc = all.find(i => i.kind === 'income' && i.date >= today) || null;
  const horizon = nextInc ? nextInc.date : toISO(addMonths(now, 1));
  const before = all.filter(i => i.kind !== 'income' && i.date < horizon);
  const oblBefore = r2(sum(before, 'amount'));
  const days = Math.max(1, diffDays(today, horizon));
  const free = r2(total - oblBefore);
  const daily = r2(free / days);
  const isDaily = t => t.type === 'expense' && !t.plan && !t.debtId;
  const spentToday = r2(sum(S.transactions.filter(t => isDaily(t) && t.date === today), 'amount'));
  const from30 = toISO(addDays(now, -30));
  const avgDaily = r2(sum(S.transactions.filter(t => isDaily(t) && t.date > from30 && t.date <= today), 'amount') / 30);
  const daysLeft = dim(now) - now.getDate();
  const endMonth = r2(total + incMonth - oblMonth);
  const overdue = curUnpaid.filter(i => i.date < today && i.kind !== 'income');

  // Считаем пошаговый остаток баланса для каждого события месяца (чтобы видеть кассовый разрыв)
  let running = total;
  for (const item of cur) {
    if (!item.done) {
      running = r2(running + (item.kind === 'income' ? item.amount : -item.amount));
      item.balanceAfter = running;
    }
  }

  return { b, total, cur, all, oblMonth, incMonth, nextInc, horizon, oblBefore, before, days, free, daily, spentToday, avgDaily, daysLeft, endMonth, endMonthReal: r2(endMonth - avgDaily * daysLeft), overdue };
}

/** Топ-4 частые категории расходов для быстрого добавления в 1 клик */
function topExpenseCategories() {
  const counts = {};
  for (const t of S.transactions) {
    if (t.type === 'expense' && t.categoryId && t.categoryId !== 'c_debt') {
      counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
    }
  }
  const defaults = ['c_food', 'c_small', 'c_cafe', 'c_transport'];
  defaults.forEach((id, idx) => { if (!(id in counts)) counts[id] = 0.5 - idx * 0.1; });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => cat(id))
    .filter(Boolean)
    .slice(0, 4);
}

/* ---------- reports ---------- */
function periodRange(rp, rFrom, rTo) {
  const now = new Date(); let from, to, label;
  if (rp === 'prev') { const p = addMonths(now, -1); from = toISO(p); to = toISO(new Date(p.getFullYear(), p.getMonth(), dim(p))); label = cap(fmtMonthYear(p)); }
  else if (rp === '3m') { from = toISO(addMonths(now, -2)); to = toISO(new Date(now.getFullYear(), now.getMonth(), dim(now))); label = '3 месяца'; }
  else if (rp === 'year') { from = now.getFullYear() + '-01-01'; to = now.getFullYear() + '-12-31'; label = now.getFullYear() + ' год'; }
  else if (rp === 'all') { from = S.transactions.reduce((m, t) => t.date < m ? t.date : m, todayStr()); to = todayStr(); label = 'Всё время'; }
  else if (rp === 'custom') { from = rFrom || toISO(addMonths(now, 0)); to = rTo || todayStr(); if (from > to) [from, to] = [to, from]; label = fmtDate(from) + ' — ' + fmtDate(to); }
  else { from = toISO(addMonths(now, 0)); to = toISO(new Date(now.getFullYear(), now.getMonth(), dim(now))); label = cap(fmtMonthYear(now)); }
  return { from, to, label };
}
function prevRange(from, to) {
  const len = diffDays(from, to) + 1;
  const f = parseISO(from);
  if (f.getDate() === 1) {
    const t = parseISO(to);
    if (t.getDate() === dim(t)) {
      const months = (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1;
      const pf = addMonths(f, -months), pt = new Date(f.getFullYear(), f.getMonth(), 0);
      return { from: toISO(pf), to: toISO(pt) };
    }
  }
  return { from: toISO(addDays(f, -len)), to: toISO(addDays(f, -1)) };
}
function byCategory(list) {
  const m = {};
  list.forEach(t => { m[t.categoryId] = (m[t.categoryId] || 0) + t.amount; });
  return Object.entries(m).map(([id, v]) => ({ id, v: r2(v), c: cat(id) || { name: 'Без категории', icon: '❔', color: '#94a3b8' } })).sort((a, b) => b.v - a.v);
}

/* ---------- files ---------- */
function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
async function saveFile(name, content, mime) {
  try {
    const file = new File([content], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) { if (e && e.name === 'AbortError') return false; }
  download(name, content, mime);
  return true;
}
const csvCell = v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csvNum = n => String(r2(n)).replace('.', ',');
function toCSV(rows) { return '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'); }
const TYPE_N = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };
function txCSV(list) {
  const rows = [['Дата', 'Тип', 'Категория', 'Сумма', 'Счёт', 'На счёт', 'Долг/кредит', 'Комментарий']];
  list.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([
    t.date, TYPE_N[t.type], t.type === 'transfer' ? '' : (cat(t.categoryId)?.name || ''),
    csvNum(t.type === 'expense' ? -t.amount : t.amount), acc(t.accountId)?.name || '', acc(t.toAccountId)?.name || '',
    debtById(t.debtId)?.name || '', t.note || '',
  ]));
  return toCSV(rows);
}

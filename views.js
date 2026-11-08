'use strict';
/* =========================================================
   ФинКонтроль — экраны (views) и рендер
   ========================================================= */

const nav = {
  tab: 'home', sub: null,
  opsMonth: addMonths(new Date(), 0), opsType: 'all', q: '',
  rp: 'month', rFrom: '', rTo: '',
  extra: 0, showClosed: false, catTab: 'expense',
};

/* ---------- small html helpers ---------- */
const emptyBox = (e, text) => `<div class="empty"><span class="e">${e}</span>${text}</div>`;
function progressBar(pct, color) { return `<div class="progress"><i style="width:${clamp(pct, 0, 100)}%;background:${color || 'var(--accent)'}"></i></div>`; }
const pctColor = p => p >= 100 ? 'var(--neg)' : p >= 80 ? 'var(--warn)' : 'var(--pos)';

function planRow(i) {
  const today = todayStr();
  const over = !i.done && i.date < today;
  const isInc = i.kind === 'income';
  const kindN = isInc ? 'доход' : i.kind === 'debt' ? 'кредит / долг' : 'обязательный платёж';
  return `<div class="row ${i.done ? 'done' : ''} ${over ? 'overdue' : ''}">
    <div class="ico">${i.icon}</div>
    <div class="grow"><div class="t">${esc(i.name)}</div><div class="s">${fmtDate(i.date)} · ${kindN}${over ? ' · просрочено!' : ''}</div></div>
    <div class="amt ${isInc ? 'pos' : ''}">${isInc ? '+' : '−'}${money(i.amount)}</div>
    ${i.done ? '<span class="badge ok">✓</span>' : `<button class="btn sm ${over ? 'danger' : ''}" data-act="planDo" data-key="${i.key}" data-date="${i.date}">${isInc ? 'Получил' : 'Оплатил'}</button>`}
  </div>`;
}

function txRow(t) {
  const c = cat(t.categoryId);
  let icon, name, sub;
  if (t.type === 'transfer') { icon = '🔁'; name = 'Перевод'; sub = accName(t.accountId) + ' → ' + accName(t.toAccountId); }
  else { icon = c?.icon || '❔'; name = c?.name || 'Без категории'; sub = accName(t.accountId); }
  if (t.debtId) { const d = debtById(t.debtId); if (d) name = (t.type === 'income' ? 'Возврат: ' : 'Платёж: ') + d.name; }
  if (t.note) sub = esc(t.note) + ' · ' + sub;
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  return `<div class="row" data-act="editTx" data-id="${t.id}">
    <div class="ico" style="background:${c ? c.color + '22' : 'var(--card2)'}">${icon}</div>
    <div class="grow"><div class="t">${esc(name)}</div><div class="s">${sub}</div></div>
    <div class="amt ${t.type === 'income' ? 'pos' : ''}">${sign}${money(t.amount)}</div>
  </div>`;
}

/* =================== ГЛАВНАЯ =================== */
function startCard() {
  const steps = [
    [S.incomes.length > 0, 'Добавьте зарплату и аванс (суммы и дни выплат)', 'plans'],
    [S.debts.length > 0, 'Внесите кредиты, рассрочки, кредитки и долги', 'debts'],
    [S.bills.length > 0, 'Добавьте обязательные платежи: аренда, связь, коммуналка', 'plans'],
    [S.transactions.some(t => t.type === 'expense' && !t.plan && !t.debtId), 'Записывайте каждую трату кнопкой «+»', 'quick'],
  ];
  if (steps.every(s => s[0])) return '';
  return `<section class="card">
    <div class="card-title">🚀 Быстрый старт <button class="link" data-act="dismissStart">Скрыть</button></div>
    ${steps.map(([ok, text, go], n) => `<div class="row" ${ok ? '' : `data-act="startStep" data-go="${go}"`}>
      <div class="ico">${ok ? '✅' : n + 1}</div><div class="grow" style="white-space:normal">${text}</div>${ok ? '' : '<span class="muted">›</span>'}</div>`).join('')}
  </section>`;
}

function viewHome() {
  const f = forecast(); const now = new Date(); const today = todayStr();
  const mTx = S.transactions.filter(t => t.date.slice(0, 7) === ym(now));
  const inc = sum(mTx.filter(t => t.type === 'income'), 'amount');
  const exp = sum(mTx.filter(t => t.type === 'expense'), 'amount');
  let h = '';

  // напоминание о резервной копии
  const lb = S.settings.lastBackup;
  if (S.transactions.length >= 15 && (!lb || Date.now() - lb > 7 * 864e5)) {
    h += `<div class="alert wn">💾 ${lb ? 'Резервная копия делалась ' + Math.floor((Date.now() - lb) / 864e5) + ' дн. назад.' : 'Вы ещё не делали резервную копию.'} Данные хранятся только на этом телефоне — сохраните копию (в Telegram, Google Диск, почту).
      <div class="btns"><button class="btn sm primary" data-act="backup">Сохранить копию</button></div></div>`;
  }
  h += startCard();

  h += `<section class="card hero">
    <div class="muted">Всего денег сейчас</div>
    <div class="big ${f.total < 0 ? 'neg' : ''}">${money(f.total)}</div>
    <div class="acc-chips">${S.accounts.map(a => `<div class="acc-chip" data-act="sub" data-sub="accounts"><span>${a.icon} ${esc(a.name)}${a.inTotal === false ? ' 🔒' : ''}</span><b>${money(f.b[a.id])}</b></div>`).join('')}</div>
  </section>`;

  if (f.overdue.length) {
    h += `<div class="alert">⚠️ <b>Просрочено ${f.overdue.length} ${plural(f.overdue.length, ['платёж', 'платежа', 'платежей'])}</b> на ${money(sum(f.overdue, 'amount'))}. Оплатите как можно скорее, чтобы не было штрафов и пеней.</div>`;
  }

  // дневной лимит
  const pct = f.daily > 0 ? f.spentToday / f.daily * 100 : (f.spentToday > 0 ? 100 : 0);
  const leftToday = r2(f.daily - f.spentToday);
  h += `<section class="card">
    <div class="card-title">💡 Можно тратить в день</div>
    <div class="big2 ${f.daily < 0 ? 'neg' : ''}">${money(Math.max(0, f.daily))}</div>
    <div class="muted small">${f.nextInc ? `до «${esc(f.nextInc.name)}» ${fmtDate(f.nextInc.date)} — ${f.days} ${plural(f.days, DAY_FORMS)}` : `до конца месяца — ${f.days} ${plural(f.days, DAY_FORMS)}. <a href="#" data-act="sub" data-sub="plans">Добавьте ЗП</a>, чтобы прогноз был точнее`}</div>
    ${progressBar(pct, pctColor(pct))}
    <div class="row-between small"><span>Сегодня потрачено: <b>${money(f.spentToday)}</b></span>
      <span class="${leftToday < 0 ? 'neg' : 'muted'}">${f.daily > 0 ? (leftToday >= 0 ? 'осталось ' + money(leftToday) : 'перерасход ' + money(-leftToday)) : ''}</span></div>
    ${f.daily < 0 ? `<div class="alert mt">Денег не хватает на обязательные платежи до следующего дохода: не хватает <b>${money(-f.free)}</b>. Сократите траты или договоритесь о переносе платежа.</div>` : ''}
    <div class="divider"></div>
    <div class="kv"><span>Нужно оплатить до ${f.nextInc ? 'ЗП' : 'конца месяца'}</span><b>${money(f.oblBefore)}</b></div>
    <div class="kv total"><span>Останется после всех платежей</span><b class="${f.free < 0 ? 'neg' : 'pos'}">${money(f.free)}</b></div>
  </section>`;

  // прогноз месяца
  h += `<section class="card">
    <div class="card-title">📅 ${cap(MONTHS[now.getMonth()])}: прогноз на конец месяца</div>
    <div class="kv"><span>Деньги сейчас</span><b>${money(f.total)}</b></div>
    <div class="kv"><span>Ещё придёт доходов</span><b class="pos">+${money(f.incMonth)}</b></div>
    <div class="kv"><span>Ещё оплатить (кредиты, долги, счета)</span><b class="neg">−${money(f.oblMonth)}</b></div>
    <div class="kv total"><span>Останется к концу месяца</span><b class="${f.endMonth < 0 ? 'neg' : 'pos'}">${money(f.endMonth)}</b></div>
    ${f.avgDaily > 0 ? `<div class="kv"><span>С учётом обычных трат (~${money(f.avgDaily)}/день)</span><b class="${f.endMonthReal < 0 ? 'neg' : ''}">${money(f.endMonthReal)}</b></div>` : ''}
    <div class="stats mt">
      <div class="stat"><span>Доходы за месяц</span><b class="pos">${money(inc)}</b></div>
      <div class="stat"><span>Расходы за месяц</span><b>${money(exp)}</b></div>
    </div>
  </section>`;

  // ближайшие платежи
  const lim = toISO(addDays(now, 14));
  const upcoming = f.all.filter(i => i.date <= lim);
  h += `<section class="card"><div class="card-title">🗓 Ближайшие 14 дней <button class="link" data-act="sub" data-sub="plans">Все</button></div>
    ${upcoming.length ? `<div class="list">${upcoming.map(planRow).join('')}</div>` : emptyBox('😌', S.incomes.length + S.bills.length + S.debts.length ? 'Нет платежей в ближайшие 2 недели' : 'Добавьте доходы, кредиты и обязательные платежи — здесь появится календарь')}
  </section>`;

  // топ категорий + бюджеты
  const cats = byCategory(mTx.filter(t => t.type === 'expense'));
  const warn = Object.entries(S.budgets).filter(([, l]) => +l > 0).map(([id, l]) => {
    const sp = sum(mTx.filter(t => t.type === 'expense' && t.categoryId === id), 'amount');
    return { c: cat(id), l: +l, sp, p: sp / l * 100 };
  }).filter(x => x.c && x.p >= 80).sort((a, b) => b.p - a.p);
  if (warn.length) {
    h += `<div class="alert wn"><b>Бюджеты:</b> ${warn.map(w => `${w.c.icon} ${esc(w.c.name)} — ${Math.round(w.p)}% (${money(w.sp)} из ${money(w.l)})`).join('<br>')}</div>`;
  }
  if (cats.length) {
    const max = cats[0].v;
    h += `<section class="card"><div class="card-title">📊 Куда ушли деньги в этом месяце <button class="link" data-tab="reports">Отчёт</button></div>
      ${cats.slice(0, 5).map(x => `<div style="margin-bottom:8px"><div class="row-between small"><span>${x.c.icon} ${esc(x.c.name)}</span><b>${money(x.v)}</b></div>
      <div class="progress thin"><i style="width:${x.v / max * 100}%;background:${x.c.color}"></i></div></div>`).join('')}
    </section>`;
  }

  // долги
  const owe = activeOweDebts();
  if (owe.length) {
    const totalOwe = sum(owe.map(debtRemaining));
    const monthly = sum(owe, 'payment');
    h += `<section class="card" data-act="goTab" data-tab2="debts" style="cursor:pointer">
      <div class="card-title">🏦 Долги и кредиты <span class="link">Подробнее ›</span></div>
      <div class="stats"><div class="stat"><span>Всего долг</span><b class="neg">${money(totalOwe)}</b></div>
      <div class="stat"><span>Платежи в месяц</span><b>${money(monthly)}</b></div></div></section>`;
  }
  return h;
}

/* =================== ОПЕРАЦИИ =================== */
function viewOps() {
  const m = nav.opsMonth;
  return `<div class="month-switch"><button class="icon-btn" data-act="opsMonth" data-d="-1">‹</button>
      <b>${cap(MONTHS[m.getMonth()])} ${m.getFullYear()}</b>
      <button class="icon-btn" data-act="opsMonth" data-d="1">›</button></div>
    <input class="search" id="opsSearch" placeholder="🔍 Поиск: комментарий, категория, сумма" value="${esc(nav.q)}">
    <div class="chips">${[['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы'], ['transfer', 'Переводы'], ['debt', 'Платежи по долгам']].map(([k, l]) => `<button class="chip ${nav.opsType === k ? 'active' : ''}" data-act="opsType" data-v="${k}">${l}</button>`).join('')}</div>
    <div id="opsList">${opsListHTML()}</div>`;
}
function opsListHTML() {
  const ymS = ym(nav.opsMonth); const q = nav.q.trim().toLowerCase();
  let list = S.transactions.filter(t => t.date.slice(0, 7) === ymS);
  if (nav.opsType === 'debt') list = list.filter(t => t.debtId);
  else if (nav.opsType !== 'all') list = list.filter(t => t.type === nav.opsType);
  if (q) list = list.filter(t => [t.note, cat(t.categoryId)?.name, acc(t.accountId)?.name, debtById(t.debtId)?.name, String(t.amount)].join(' ').toLowerCase().includes(q));
  list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const inc = sum(list.filter(t => t.type === 'income'), 'amount'), exp = sum(list.filter(t => t.type === 'expense'), 'amount');
  let h = `<div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px">
    <div class="stat"><span>Доходы</span><b class="pos">${moneyShort(inc)}</b></div>
    <div class="stat"><span>Расходы</span><b>${moneyShort(exp)}</b></div>
    <div class="stat"><span>Итог</span><b class="${inc - exp < 0 ? 'neg' : 'pos'}">${moneyShort(inc - exp)}</b></div></div>`;
  if (!list.length) return h + emptyBox('🧾', 'Операций нет. Нажмите «+», чтобы записать трату или доход.');
  const groups = {};
  list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  h += Object.entries(groups).map(([d, arr]) => {
    const dayExp = sum(arr.filter(t => t.type === 'expense'), 'amount');
    return `<div class="day-head"><span>${fmtDayHead(d)}</span><span>${dayExp ? '−' + money(dayExp) : ''}</span></div>
      <div class="card" style="padding:4px 12px;margin-bottom:4px"><div class="list">${arr.map(txRow).join('')}</div></div>`;
  }).join('');
  return h;
}
function afterOps() {
  const s = $('#opsSearch');
  if (s) s.oninput = () => { nav.q = s.value; $('#opsList').innerHTML = opsListHTML(); };
}

/* =================== ДОЛГИ =================== */
function debtCard(d) {
  const rem = debtRemaining(d);
  const total = +d.total || rem;
  const paidPct = total > 0 ? clamp((total - rem) / total * 100, 0, 100) : 0;
  const k = DEBT_KINDS[d.kind] || DEBT_KINDS.credit;
  const lent = d.kind === 'lent';
  const po = +d.payment > 0 ? debtPayoffInfo(d) : null;
  const monthDone = isPlanDone('debt:' + d.id, ym(new Date()));
  let closeTxt;
  if (rem <= 0) closeTxt = '<span class="pos">Полностью закрыт 🎉</span>';
  else if (!po) closeTxt = '<span class="muted">Без графика — укажите платёж в месяц, чтобы увидеть дату закрытия</span>';
  else if (po.never) closeTxt = '<span class="neg">⚠️ Платёж меньше начисляемых процентов — долг не уменьшается! Нужно платить больше.</span>';
  else closeTxt = `${lent ? 'Вернут' : 'Закроется'} через <b>${po.months} ${plural(po.months, MONTH_FORMS)}</b> — <b>${fmtMonthYear(po.date)}</b>${po.interest > 0 ? `<br><span class="muted">Ещё переплата процентами: ${money(po.interest)}</span>` : ''}`;
  return `<section class="card debt">
    <div class="head"><div class="ico">${k.i}</div>
      <div class="grow" style="min-width:0"><div style="font-weight:650">${esc(d.name)}</div><div class="muted small">${k.n}${d.note ? ' · ' + esc(d.note) : ''}</div></div>
      ${!lent && +d.payment > 0 && rem > 0 ? (monthDone ? '<span class="badge ok">оплачен в этом мес.</span>' : '<span class="badge wn">не оплачен</span>') : ''}
    </div>
    <div class="row-between" style="margin-top:12px;align-items:baseline"><div><div class="muted small">${lent ? 'Вам должны' : 'Осталось выплатить'}</div><div class="rem ${lent ? 'pos' : ''}">${money(rem)}</div></div>
      <div class="muted small" style="text-align:right">из ${money(total)}<br>${lent ? 'возвращено' : 'выплачено'} ${Math.round(paidPct)}%</div></div>
    ${progressBar(paidPct, 'var(--pos)')}
    <div class="meta">
      <div>Платёж/мес<b>${+d.payment ? money(d.payment) : '—'}</b></div>
      <div>День<b>${d.payDay ? d.payDay + '-е число' : '—'}</b></div>
      <div>Ставка<b>${+d.rate ? d.rate + '%' : '0%'}</b></div>
    </div>
    <div class="close-txt">${closeTxt}</div>
    <div class="btns">
      ${rem > 0 ? `<button class="btn sm primary" data-act="payDebt" data-id="${d.id}">${lent ? '💰 Мне вернули' : '💳 Внести платёж'}</button>` : ''}
      <button class="btn sm" data-act="debtHistory" data-id="${d.id}">История</button>
      <button class="btn sm" data-act="editDebt" data-id="${d.id}">Изменить</button>
    </div>
  </section>`;
}

function viewDebts() {
  const owe = S.debts.filter(d => !d.closed && d.kind !== 'lent');
  const lent = S.debts.filter(d => !d.closed && d.kind === 'lent');
  const closed = S.debts.filter(d => d.closed);
  if (!S.debts.length) {
    return `<section class="card">${emptyBox('🏦', 'Здесь будут все ваши кредиты, ипотека, рассрочки, кредитки, микрозаймы, долги людям — и кто должен вам.<br><br>Приложение посчитает, когда закроется каждый долг, сколько переплата, и подскажет, как закрыть быстрее.')}
      <button class="btn primary block" data-act="addDebt">+ Добавить долг или кредит</button></section>`;
  }
  const act = owe.filter(d => debtRemaining(d) > 0);
  const totalOwe = sum(act.map(debtRemaining));
  const monthly = sum(act, 'payment');
  const income = sum(S.incomes.filter(i => i.active !== false), 'amount');
  const pdn = income > 0 ? monthly / income * 100 : null;
  const infos = act.map(d => +d.payment > 0 ? debtPayoffInfo(d) : null);
  const anyNever = infos.some(p => p && p.never);
  const noSched = infos.some(p => !p);
  const freedom = infos.filter(p => p && p.date).reduce((m, p) => !m || p.date > m ? p.date : m, null);
  const interestAhead = sum(infos.filter(p => p && !p.never), 'interest');
  let h = '';
  if (act.length) {
    let pdnTxt = '', pdnCls = '';
    if (pdn != null) {
      if (pdn < 30) { pdnCls = 'pos'; pdnTxt = 'Нормальная нагрузка'; }
      else if (pdn < 50) { pdnCls = 'warn'; pdnTxt = 'Высокая — новые кредиты не берите'; }
      else { pdnCls = 'neg'; pdnTxt = 'Критическая! Больше половины дохода уходит на долги'; }
    }
    h += `<section class="card">
      <div class="card-title">📌 Сводка по долгам</div>
      <div class="stats">
        <div class="stat"><span>Всего должен</span><b class="neg">${money(totalOwe)}</b></div>
        <div class="stat"><span>Платежи в месяц</span><b>${money(monthly)}</b></div>
        <div class="stat"><span>Свобода от долгов</span><b>${anyNever ? '∞' : freedom ? cap(fmtMonthYear(freedom)) : '—'}</b></div>
        <div class="stat"><span>Переплата впереди</span><b>${money(interestAhead)}</b></div>
      </div>
      ${pdn != null ? `<div class="mt"><div class="row-between small"><span>Долговая нагрузка (ПДН): <b class="${pdnCls}">${Math.round(pdn)}%</b> дохода</span><span class="${pdnCls}">${pdnTxt}</span></div>${progressBar(pdn, pdnCls === 'pos' ? 'var(--pos)' : pdnCls === 'warn' ? 'var(--warn)' : 'var(--neg)')}</div>` : '<div class="muted small mt">Добавьте доходы в «Ещё → Доходы и платежи», чтобы увидеть долговую нагрузку.</div>'}
      ${noSched ? '<div class="muted small">У некоторых долгов не указан платёж в месяц — они не учтены в дате свободы.</div>' : ''}
    </section>`;
  }
  h += owe.map(debtCard).join('');
  if (act.length >= 1) h += strategyCard();
  if (lent.length) {
    h += `<div class="day-head" style="font-size:15px;color:var(--text)"><span>💸 Мне должны: ${money(sum(lent.map(debtRemaining)))}</span></div>` + lent.map(debtCard).join('');
  }
  if (closed.length) {
    h += `<button class="btn block ghost" data-act="toggleClosed">${nav.showClosed ? 'Скрыть' : 'Показать'} закрытые (${closed.length})</button><div style="height:10px"></div>`;
    if (nav.showClosed) h += closed.map(debtCard).join('');
  }
  return h;
}

function strategyCard() {
  const act = activeOweDebts().filter(d => +d.payment > 0);
  if (!act.length) return '';
  const base = simulateAll(0, 'avalanche');
  const extra = nav.extra || 0;
  const av = simulateAll(extra, 'avalanche'), sn = simulateAll(extra, 'snowball');
  const now = new Date();
  const res = (r, title, desc) => {
    if (r.never) return `<div><h4>${title}</h4><div class="neg small">Не погасится — увеличьте платежи</div></div>`;
    const saved = base.never ? 0 : r2(base.interest - r.interest);
    return `<div><h4>${title}</h4><div class="muted small">${desc}</div>
      <div class="mt"><b>${r.months} ${plural(r.months, MONTH_FORMS)}</b> → ${fmtMonthYear(addMonths(now, r.months - 1))}</div>
      <div class="small">Переплата: ${money(r.interest)}</div>
      ${saved > 0 ? `<div class="small pos">Экономия: ${money(saved)}</div>` : ''}
      <ol>${r.order.map(x => `<li>${esc(x.name)} — ${x.closedAt} мес.</li>`).join('')}</ol></div>`;
  };
  return `<section class="card">
    <div class="card-title">🧠 Как закрыть долги быстрее</div>
    <div class="muted small">Сколько вы можете добавлять сверху к платежам каждый месяц? Когда один долг закрывается, его платёж идёт на следующий («снежный ком»).</div>
    <div class="field mt"><span>Доплата в месяц</span><input class="inp" id="extraInp" inputmode="decimal" value="${extra || ''}" placeholder="например 5000"></div>
    <div class="mt"></div>
    <div class="strategy">
      ${res(av, '🏔 Лавина', 'Сначала самая высокая ставка — максимальная экономия')}
      ${res(sn, '⛄ Снежный ком', 'Сначала самый маленький долг — быстрые победы, мотивация')}
    </div>
    ${!base.never ? `<div class="muted small mt">Без доплат и без «снежного кома» последний долг закроется через ${Math.max(0, ...activeOweDebts().map(d => (debtPayoffInfo(d) || {}).months || 0))} мес.</div>` : ''}
  </section>`;
}

/* =================== ОТЧЁТЫ =================== */
function donutSVG(parts, top, bottom) {
  const total = sum(parts, 'value'); const R = 70, C = 2 * Math.PI * R; let off = 0;
  const segs = total > 0 ? parts.map(p => {
    const len = p.value / total * C;
    const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${p.color}" stroke-width="24" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
    off += len; return s;
  }).join('') : `<circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--line)" stroke-width="24"/>`;
  return `<svg viewBox="0 0 180 180" class="donut"><g transform="rotate(-90 90 90)">${segs}</g>
    <text x="90" y="88" text-anchor="middle" class="d1">${esc(top)}</text><text x="90" y="106" text-anchor="middle" class="d2">${esc(bottom)}</text></svg>`;
}
function barsHTML(list, from, to) {
  const days = diffDays(from, to) + 1; const d0 = parseISO(from); let buckets = [];
  if (days <= 62) {
    const map = {}; list.forEach(t => map[t.date] = (map[t.date] || 0) + t.amount);
    for (let i = 0; i < days; i++) { const d = addDays(d0, i); const k = toISO(d); buckets.push({ k: fmtDate(k), label: d.getDate(), v: map[k] || 0 }); }
  } else {
    const map = {}; list.forEach(t => { const k = t.date.slice(0, 7); map[k] = (map[k] || 0) + t.amount; });
    let d = addMonths(d0, 0); const end = parseISO(to);
    while (d <= end) { const k = ym(d); buckets.push({ k: fmtMonthYear(d), label: MONTHS_SHORT[d.getMonth()], v: map[k] || 0 }); d = addMonths(d, 1); }
  }
  const max = Math.max(0, ...buckets.map(b => b.v));
  const step = Math.ceil(buckets.length / 10);
  return `<div class="bars">${buckets.map((b, i) => `<div class="bar" title="${esc(b.k)}: ${esc(money(b.v))}"><i style="height:${max ? b.v / max * 100 : 0}%"></i><span>${i % step === 0 ? b.label : ''}</span></div>`).join('')}</div>`;
}

function reportData() {
  const { from, to, label } = periodRange(nav.rp, nav.rFrom, nav.rTo);
  const list = S.transactions.filter(t => t.date >= from && t.date <= to);
  const exps = list.filter(t => t.type === 'expense'), incs = list.filter(t => t.type === 'income');
  const exp = r2(sum(exps, 'amount')), inc = r2(sum(incs, 'amount'));
  const pr = prevRange(from, to);
  const prevExps = S.transactions.filter(t => t.type === 'expense' && t.date >= pr.from && t.date <= pr.to);
  return { from, to, label, list, exps, incs, exp, inc, pr, prevExps, cats: byCategory(exps), prevCats: byCategory(prevExps), incCats: byCategory(incs) };
}

function viewReports() {
  const R = reportData();
  const today = todayStr();
  const elapsed = Math.max(1, diffDays(R.from, R.to < today ? R.to : today) + 1);
  const avg = R.exp / elapsed;
  const prevExp = sum(R.prevExps, 'amount');
  const small = R.exps.filter(t => !t.debtId && !t.plan && t.amount <= (+S.settings.smallLimit || 0));
  const smallSum = sum(small, 'amount');
  const debtPaid = sum(R.exps.filter(t => t.debtId), 'amount');
  const savingsRate = R.inc > 0 ? (R.inc - R.exp) / R.inc * 100 : null;
  const prevMap = {}; R.prevCats.forEach(x => prevMap[x.id] = x.v);

  let h = `<div class="chips">${[['month', 'Этот месяц'], ['prev', 'Прошлый'], ['3m', '3 месяца'], ['year', 'Год'], ['all', 'Всё время'], ['custom', 'Период…']].map(([k, l]) => `<button class="chip ${nav.rp === k ? 'active' : ''}" data-act="rp" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (nav.rp === 'custom') {
    h += `<div class="grid2" style="margin-bottom:10px"><label class="field"><span>С</span><input type="date" data-rdate="rFrom" value="${R.from}"></label><label class="field"><span>По</span><input type="date" data-rdate="rTo" value="${R.to}"></label></div>`;
  }
  h += `<section class="card"><div class="card-title">${esc(R.label)}</div>
    <div class="stats">
      <div class="stat"><span>Доходы</span><b class="pos">${money(R.inc)}</b></div>
      <div class="stat"><span>Расходы</span><b>${money(R.exp)}</b></div>
      <div class="stat"><span>Остаток (доходы − расходы)</span><b class="${R.inc - R.exp < 0 ? 'neg' : 'pos'}">${money(R.inc - R.exp)}</b></div>
      <div class="stat"><span>В среднем в день</span><b>${money(avg)}</b></div>
    </div></section>`;

  // инсайты
  const ins = [];
  if (savingsRate != null) ins.push(['🐷', savingsRate >= 20 ? `Вы сохранили <b>${Math.round(savingsRate)}%</b> дохода — отлично! Цель: 10–20% и больше.` : savingsRate >= 0 ? `Сохранено <b>${Math.round(savingsRate)}%</b> дохода. Старайтесь откладывать хотя бы 10%.` : `Расходы превысили доходы на <b>${money(R.exp - R.inc)}</b>. Срочно найдите, что сократить.`]);
  if (smallSum > 0) ins.push(['🪙', `Мелкие траты (до ${money(S.settings.smallLimit)}): <b>${small.length} шт. на ${money(smallSum)}</b> — ${Math.round(smallSum / (R.exp || 1) * 100)}% расходов. В пересчёте на год это ≈ <b>${money(smallSum / elapsed * 365)}</b>.`]);
  if (R.cats[0]) ins.push([R.cats[0].c.icon, `Больше всего ушло на «${esc(R.cats[0].c.name)}»: <b>${money(R.cats[0].v)}</b> (${Math.round(R.cats[0].v / R.exp * 100)}%).`]);
  if (debtPaid > 0) ins.push(['🏦', `На кредиты и долги: <b>${money(debtPaid)}</b>${R.inc > 0 ? ` — ${Math.round(debtPaid / R.inc * 100)}% дохода` : ''}.`]);
  if (prevExp > 0 && R.exp > 0) { const ch = (R.exp - prevExp) / prevExp * 100; ins.push([ch > 0 ? '📈' : '📉', `По сравнению с предыдущим периодом расходы ${ch > 0 ? 'выросли' : 'снизились'} на <b>${Math.abs(Math.round(ch))}%</b> (${money(prevExp)} → ${money(R.exp)}).`]); }
  if (nav.rp === 'month' && R.exp > 0) ins.push(['🔮', `Если тратить в том же темпе, за месяц выйдет ≈ <b>${money(avg * dim(new Date()))}</b>.`]);
  if (ins.length) h += `<section class="card"><div class="card-title">🧭 Анализ</div>${ins.map(([e, t]) => `<div class="insight"><span class="e">${e}</span><div>${t}</div></div>`).join('')}</section>`;

  // категории
  h += `<section class="card"><div class="card-title">🍩 Расходы по категориям</div>`;
  if (R.cats.length) {
    h += `<div class="donut-wrap">${donutSVG(R.cats.map(x => ({ value: x.v, color: x.c.color })), moneyShort(R.exp), 'всего, ' + S.settings.currency)}</div><div class="list">`;
    h += R.cats.map(x => {
      const p = x.v / R.exp * 100; const pv = prevMap[x.id] || 0; const ch = pv ? (x.v - pv) / pv * 100 : null;
      const bud = +S.budgets[x.id] || 0;
      return `<div class="row" data-act="catDrill" data-id="${x.id}">
        <div class="ico" style="background:${x.c.color}22">${x.c.icon}</div>
        <div class="grow"><div class="t">${esc(x.c.name)}</div>
          <div class="s">${p.toFixed(1)}%${ch != null && Math.abs(ch) >= 1 ? ` · <span class="${ch > 0 ? 'neg' : 'pos'}">${ch > 0 ? '▲' : '▼'}${Math.abs(Math.round(ch))}%</span>` : ''}${bud && nav.rp === 'month' ? ` · бюджет ${money(bud)}` : ''}</div>
          <div class="progress thin"><i style="width:${p}%;background:${x.c.color}"></i></div></div>
        <div class="amt">${money(x.v)}</div></div>`;
    }).join('') + '</div>';
  } else h += emptyBox('📭', 'Нет расходов за этот период');
  h += `</section>`;

  if (R.exps.length) h += `<section class="card"><div class="card-title">📆 Расходы по ${diffDays(R.from, R.to) <= 62 ? 'дням' : 'месяцам'}</div>${barsHTML(R.exps, R.from, R.to)}</section>`;

  if (R.incCats.length) {
    h += `<section class="card"><div class="card-title">💼 Доходы по источникам</div><div class="list">${R.incCats.map(x => `<div class="row"><div class="ico">${x.c.icon}</div><div class="grow"><div class="t">${esc(x.c.name)}</div></div><div class="amt pos">+${money(x.v)}</div></div>`).join('')}</div></section>`;
  }

  const top = R.exps.slice().sort((a, b) => b.amount - a.amount).slice(0, 10);
  if (top.length) h += `<section class="card"><div class="card-title">🔝 Самые крупные траты</div><div class="list">${top.map(txRow).join('')}</div></section>`;

  h += `<section class="card"><div class="card-title">📤 Выгрузить отчёт</div>
    <div class="muted small">CSV открывается в Excel и Google Таблицах. PDF — через «Печать → Сохранить как PDF».</div>
    <div class="btns">
      <button class="btn" data-act="exportCSV">📄 Операции (Excel)</button>
      <button class="btn" data-act="exportCatCSV">📊 По категориям (Excel)</button>
      <button class="btn" data-act="printReport">🖨 PDF / печать</button>
    </div></section>`;
  return h;
}

/* =================== ЕЩЁ =================== */
function viewMore() {
  const t = (sub, e, title, desc) => `<button class="tile" data-act="sub" data-sub="${sub}"><span class="e">${e}</span><b>${title}</b><span>${desc}</span></button>`;
  return `<div class="tiles">
    ${t('plans', '💼', 'Доходы и платежи', 'ЗП, аванс, аренда, связь…')}
    ${t('budgets', '🎯', 'Бюджеты', 'Лимиты по категориям')}
    ${t('goals', '🐷', 'Цели', 'Подушка, накопления')}
    ${t('accounts', '💳', 'Счета', 'Карты, наличные')}
    ${t('categories', '🏷', 'Категории', 'Настроить под себя')}
    ${t('settings', '⚙️', 'Настройки', 'Валюта, PIN, тема')}
    ${t('backupScr', '💾', 'Резервная копия', 'Сохранить / восстановить')}
    ${t('help', '📲', 'Установка', 'Как поставить на телефон')}
  </div>
  <section class="card mt">
    <div class="card-title">📚 Правила финансовой грамотности</div>
    <div class="insight"><span class="e">1️⃣</span><div><b>Записывайте всё</b>, даже мелочи. Через месяц вы увидите, куда «утекают» деньги.</div></div>
    <div class="insight"><span class="e">2️⃣</span><div><b>Сначала заплати себе:</b> в день ЗП сразу откладывайте 10% в цель «Подушка».</div></div>
    <div class="insight"><span class="e">3️⃣</span><div><b>Подушка безопасности</b> — 3–6 месячных расходов. Пока её нет, не берите новых кредитов.</div></div>
    <div class="insight"><span class="e">4️⃣</span><div><b>Платежи по долгам — не больше 30% дохода.</b> Смотрите ПДН во вкладке «Долги».</div></div>
    <div class="insight"><span class="e">5️⃣</span><div><b>Закрывайте сначала дорогие долги</b> (микрозаймы, кредитки) — стратегия «Лавина».</div></div>
    <div class="insight"><span class="e">6️⃣</span><div><b>Правило 50/30/20:</b> 50% — обязательное, 30% — желания, 20% — накопления и досрочное погашение.</div></div>
    <div class="insight"><span class="e">7️⃣</span><div><b>Правило 24 часов:</b> для покупок вне плана подождите сутки — половина желаний пройдёт.</div></div>
  </section>`;
}

function viewPlans() {
  const now = new Date(); const items = planItems(now);
  const incT = sum(S.incomes.filter(x => x.active !== false), 'amount');
  const billT = sum(S.bills.filter(x => x.active !== false), 'amount');
  const debtT = sum(activeOweDebts(), 'payment');
  let h = `<section class="card"><div class="card-title">🧮 Ежемесячный баланс</div>
    <div class="kv"><span>Доходы в месяц</span><b class="pos">+${money(incT)}</b></div>
    <div class="kv"><span>Кредиты и долги</span><b>−${money(debtT)}</b></div>
    <div class="kv"><span>Обязательные платежи</span><b>−${money(billT)}</b></div>
    <div class="kv total"><span>Остаётся на жизнь и накопления</span><b class="${incT - debtT - billT < 0 ? 'neg' : 'pos'}">${money(incT - debtT - billT)}</b></div>
    ${incT > 0 ? `<div class="muted small">≈ ${money((incT - debtT - billT) / 30)} в день</div>` : ''}
  </section>`;
  h += `<section class="card"><div class="card-title">💼 Доходы (ЗП, аванс, подработка) <button class="link" data-act="editIncome">+ Добавить</button></div>
    ${S.incomes.length ? `<div class="list">${S.incomes.map(x => `<div class="row" data-act="editIncome" data-id="${x.id}" style="${x.active === false ? 'opacity:.5' : ''}"><div class="ico">${cat(x.categoryId)?.icon || '💼'}</div><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">каждое ${x.day}-е число · ${accName(x.accountId)}</div></div><div class="amt pos">+${money(x.amount)}</div></div>`).join('')}</div>` : emptyBox('💼', 'Добавьте зарплату и аванс отдельно — с днями выплат. Тогда приложение посчитает, сколько можно тратить до следующей ЗП.')}
  </section>`;
  h += `<section class="card"><div class="card-title">🧾 Обязательные платежи <button class="link" data-act="editBill">+ Добавить</button></div>
    ${S.bills.length ? `<div class="list">${S.bills.map(x => `<div class="row" data-act="editBill" data-id="${x.id}" style="${x.active === false ? 'opacity:.5' : ''}"><div class="ico">${cat(x.categoryId)?.icon || '🧾'}</div><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">каждое ${x.day}-е число · ${esc(cat(x.categoryId)?.name || '')}</div></div><div class="amt">−${money(x.amount)}</div></div>`).join('')}</div>` : emptyBox('🧾', 'Аренда, коммуналка, связь, интернет, подписки, садик, страховка — всё, что платите каждый месяц.')}
    <div class="muted small mt">Кредиты и долги добавляются во вкладке «Долги» и попадают в календарь автоматически.</div>
  </section>`;
  h += `<section class="card"><div class="card-title">📅 Календарь: ${fmtMonthYear(now)}</div>
    ${items.length ? `<div class="list">${items.map(planRow).join('')}</div>` : emptyBox('📅', 'Пока пусто')}</section>`;
  return h;
}

function viewBudgets() {
  const m = ym(new Date());
  const mTx = S.transactions.filter(t => t.type === 'expense' && t.date.slice(0, 7) === m);
  const income = sum(S.incomes.filter(i => i.active !== false), 'amount');
  const limits = Object.values(S.budgets).reduce((s, v) => s + (+v || 0), 0);
  const cats = S.categories.filter(c => c.type === 'expense');
  let h = `<section class="card"><div class="card-title">🎯 Лимиты на ${fmtMonthYear(new Date())}</div>
    <div class="muted small">Задайте, сколько готовы тратить в месяц на каждую категорию. Пустое поле — без лимита. Когда потрачено 80%+, на главной появится предупреждение.</div>
    <div class="stats mt"><div class="stat"><span>Сумма лимитов</span><b>${money(limits)}</b></div><div class="stat"><span>Доход в месяц</span><b>${money(income)}</b></div></div>
    ${income > 0 ? `<div class="muted small mt">По правилу 50/30/20: обязательное ≤ ${money(income * .5)}, желания ≤ ${money(income * .3)}, накопления ≥ ${money(income * .2)}.</div>` : ''}
  </section><section class="card"><div class="list">`;
  h += cats.map(c => {
    const l = +S.budgets[c.id] || 0; const sp = sum(mTx.filter(t => t.categoryId === c.id), 'amount');
    const p = l ? sp / l * 100 : 0;
    return `<div class="row" style="flex-wrap:wrap"><div class="ico" style="background:${c.color}22">${c.icon}</div>
      <div class="grow"><div class="t">${esc(c.name)}</div><div class="s">потрачено ${money(sp)}${l ? ` · ${l - sp >= 0 ? 'осталось ' + money(l - sp) : '<span class="neg">превышено на ' + money(sp - l) + '</span>'}` : ''}</div></div>
      <input class="inp budget-inp" inputmode="decimal" data-budget="${c.id}" value="${l || ''}" placeholder="лимит">
      ${l ? `<div style="flex-basis:100%"><div class="progress thin"><i style="width:${clamp(p, 0, 100)}%;background:${pctColor(p)}"></i></div></div>` : ''}
    </div>`;
  }).join('');
  return h + '</div></section>';
}

function viewGoals() {
  if (!S.goals.length) return `<section class="card">${emptyBox('🐷', 'Цели помогают копить: подушка безопасности, отпуск, телефон, первый взнос…<br>Совет: первая цель — подушка на 3 месяца расходов.')}<button class="btn primary block" data-act="editGoal">+ Новая цель</button></section>`;
  const now = new Date();
  return S.goals.map(g => {
    const p = g.target > 0 ? g.saved / g.target * 100 : 0;
    let per = '';
    if (g.deadline && g.saved < g.target) {
      const d = parseISO(g.deadline); const months = Math.max(1, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth());
      per = `Откладывайте ${money((g.target - g.saved) / months)} в месяц, чтобы успеть к ${fmtDate(g.deadline)}`;
    }
    return `<section class="card"><div class="head row" style="border:0;padding:0"><div class="ico">${g.icon || '🎯'}</div><div class="grow"><div class="t">${esc(g.name)}</div><div class="s">${money(g.saved)} из ${money(g.target)}</div></div><b>${Math.round(p)}%</b></div>
      ${progressBar(p, p >= 100 ? 'var(--pos)' : 'var(--accent)')}
      <div class="muted small">${p >= 100 ? '🎉 Цель достигнута!' : per || 'Осталось ' + money(g.target - g.saved)}</div>
      <div class="btns"><button class="btn sm primary" data-act="goalAdd" data-id="${g.id}">+ Пополнить</button><button class="btn sm" data-act="goalAdd" data-id="${g.id}" data-minus="1">− Снять</button><button class="btn sm" data-act="editGoal" data-id="${g.id}">Изменить</button></div></section>`;
  }).join('');
}

function viewAccounts() {
  const b = balances();
  return `<section class="card"><div class="card-title">Всего (учитываемые): ${money(totalBalance(b))}</div><div class="list">
    ${S.accounts.map(a => `<div class="row" data-act="editAccount" data-id="${a.id}"><div class="ico">${a.icon}</div><div class="grow"><div class="t">${esc(a.name)}</div><div class="s">${a.inTotal === false ? 'не входит в «Всего денег» (копилка/депозит)' : 'входит в общий баланс'}</div></div><div class="amt ${b[a.id] < 0 ? 'neg' : ''}">${money(b[a.id])}</div></div>`).join('')}
  </div></section>
  <div class="btns"><button class="btn primary" data-act="editAccount">+ Новый счёт</button><button class="btn" data-act="transfer">🔁 Перевод между счетами</button></div>
  <div class="muted small mt">Совет: создайте счёт «Копилка» и снимите галочку «входит в общий баланс» — так отложенные деньги не будут считаться доступными для трат.</div>`;
}

function viewCategories() {
  const list = S.categories.filter(c => c.type === nav.catTab);
  return `<div class="chips"><button class="chip ${nav.catTab === 'expense' ? 'active' : ''}" data-act="catTab" data-v="expense">Расходы</button><button class="chip ${nav.catTab === 'income' ? 'active' : ''}" data-act="catTab" data-v="income">Доходы</button></div>
    <section class="card"><div class="list">${list.map(c => `<div class="row" data-act="editCat" data-id="${c.id}"><div class="ico" style="background:${c.color}22">${c.icon}</div><div class="grow"><div class="t">${esc(c.name)}</div></div><span class="dot" style="background:${c.color}"></span></div>`).join('')}</div></section>
    <button class="btn primary block" data-act="editCat">+ Новая категория</button>`;
}

function viewSettings() {
  const s = S.settings;
  return `<section class="card form">
    <label class="field"><span>Валюта</span><select data-set="currency">${CURRENCIES.map(([v, l]) => `<option value="${v}" ${s.currency === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Тема</span><select data-set="theme"><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Тёмная</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Светлая</option></select></label>
    <label class="field"><span>«Мелкая трата» — до какой суммы</span><input data-set="smallLimit" inputmode="decimal" value="${s.smallLimit}"><small>Для анализа мелких трат в отчётах</small></label>
  </section>
  <section class="card"><div class="card-title">🔒 PIN-код</div>
    <div class="muted small">Защищает от посторонних глаз при открытии приложения.</div>
    <div class="btns">${s.pin ? '<button class="btn" data-act="setPin">Сменить PIN</button><button class="btn danger" data-act="removePin">Убрать PIN</button>' : '<button class="btn primary" data-act="setPin">Установить PIN</button>'}</div>
  </section>
  <section class="card"><div class="card-title">🗂 Данные</div>
    <div class="muted small">Операций: ${S.transactions.length} · Долгов: ${S.debts.length} · Размер: ${(JSON.stringify(S).length / 1024).toFixed(1)} КБ</div>
    <div class="btns"><button class="btn" data-act="sub" data-sub="backupScr">💾 Резервная копия</button><button class="btn danger" data-act="reset">Удалить все данные</button></div>
  </section>
  <div class="muted small center">ФинКонтроль · данные хранятся только на вашем устройстве</div>`;
}

function viewBackup() {
  const lb = S.settings.lastBackup;
  return `<section class="card"><div class="card-title">💾 Резервная копия</div>
    <div class="muted small">Все данные хранятся в памяти телефона (в браузере). Если очистить данные браузера или сменить телефон — они пропадут. Поэтому регулярно сохраняйте копию: отправьте файл себе в Telegram «Избранное», на Google Диск или почту.</div>
    <div class="kv mt"><span>Последняя копия</span><b>${lb ? new Date(lb).toLocaleString('ru-RU') : 'не делалась'}</b></div>
    <div class="btns"><button class="btn primary" data-act="backup">⬇️ Сохранить копию</button><button class="btn" data-act="importData">⬆️ Восстановить из файла</button></div>
  </section>
  <section class="card"><div class="card-title">📄 Все операции в Excel</div><div class="btns"><button class="btn" data-act="exportAll">Выгрузить CSV</button></div></section>
  <section class="card"><div class="card-title">📱 Перенос на другой телефон</div><div class="muted small">1) Здесь: «Сохранить копию» → отправьте файл себе. 2) На новом телефоне откройте приложение → «Ещё → Резервная копия → Восстановить из файла».</div></section>`;
}

function viewHelp() {
  return `<section class="card"><div class="card-title">🤖 Android (Chrome)</div>
    <div class="insight"><span class="e">1</span><div>Откройте ссылку на приложение в Chrome</div></div>
    <div class="insight"><span class="e">2</span><div>Меню ⋮ → <b>«Установить приложение»</b> или «Добавить на главный экран»</div></div>
    <div class="insight"><span class="e">3</span><div>Иконка «ФинКонтроль» появится на рабочем столе. Работает без интернета.</div></div></section>
  <section class="card"><div class="card-title">🍏 iPhone (Safari)</div>
    <div class="insight"><span class="e">1</span><div>Откройте ссылку именно в <b>Safari</b></div></div>
    <div class="insight"><span class="e">2</span><div>Кнопка «Поделиться» ⬆️ → <b>«На экран „Домой“»</b></div></div>
    <div class="insight"><span class="e">3</span><div>Запускайте с иконки — откроется как обычное приложение.</div></div></section>
  <div class="alert info">Данные привязаны к браузеру, в котором вы открыли приложение. Всегда открывайте его одним и тем же способом (с иконки) и делайте резервные копии.</div>`;
}

/* =================== RENDER =================== */
const VIEWS = {
  home: { title: 'ФинКонтроль', render: viewHome },
  ops: { title: 'Операции', render: viewOps, after: afterOps },
  debts: { title: 'Долги и кредиты', render: viewDebts, actions: () => '<button class="btn sm primary" data-act="addDebt">+ Добавить</button>' },
  reports: { title: 'Отчёты', render: viewReports },
  more: { title: 'Ещё', render: viewMore },
  plans: { title: 'Доходы и платежи', render: viewPlans },
  budgets: { title: 'Бюджеты', render: viewBudgets },
  goals: { title: 'Цели', render: viewGoals, actions: () => S.goals.length ? '<button class="btn sm primary" data-act="editGoal">+ Цель</button>' : '' },
  accounts: { title: 'Счета', render: viewAccounts },
  categories: { title: 'Категории', render: viewCategories },
  settings: { title: 'Настройки', render: viewSettings },
  backupScr: { title: 'Резервная копия', render: viewBackup },
  help: { title: 'Установка', render: viewHelp },
};

function render() {
  document.documentElement.dataset.theme = S.settings.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = S.settings.theme === 'light' ? '#f2f4f9' : '#0b1020';
  const V = VIEWS[nav.sub || nav.tab] || VIEWS.home;
  $('#title').textContent = V.title;
  $('#topActions').innerHTML = V.actions ? V.actions() : '';
  $('#backBtn').classList.toggle('hidden', !nav.sub);
  $('#view').innerHTML = V.render();
  $$('.tabbar [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === nav.tab));
  if (V.after) V.after();
}

'use strict';
/* =========================================================
   ФинКонтроль — чистый и понятный интерфейс (v2.5 Pro)
   ========================================================= */

const nav = {
  tab: 'home', sub: null,
  homeFilter: 'all', // 'all' | 'unpaid' | 'done' — фильтр в Плане месяца на Главной
  opsMonth: addMonths(new Date(), 0), opsType: 'all', q: '',
  rp: 'month', rFrom: '', rTo: '',
  extra: 0, showClosed: false, catTab: 'expense',
};

const emptyBox = (e, text) => `<div class="empty"><span class="e">${e}</span>${text}</div>`;
function progressBar(pct, color) { return `<div class="progress"><i style="width:${clamp(pct, 0, 100)}%;background:${color || 'var(--accent)'}"></i></div>`; }
const pctColor = p => p >= 100 ? 'var(--neg)' : p >= 80 ? 'var(--warn)' : 'var(--pos)';

/** Строка любого обязательного платежа / кредита / дохода в едином окне */
function planRow(i) {
  const today = todayStr();
  const over = !i.done && i.date < today;
  const isInc = i.kind === 'income';
  const editAct = i.kind === 'debt' ? 'editDebt' : i.kind === 'income' ? 'editIncome' : 'editBill';

  let subInfo = fmtDate(i.date);
  if (i.kind === 'debt') {
    subInfo += ` · остаток ${money(i.rem)}`;
    if (i.monthsLeft) subInfo += ` (${i.monthsLeft} мес.)`;
    else if (i.noFixedPayment) subInfo += ` · без графика`;
  } else if (i.kind === 'bill') {
    subInfo += ` · счёт`;
  } else {
    subInfo += ` · доход`;
  }
  if (over) subInfo += ` · ждёт оплаты`;

  return `<div class="plan-item ${i.done ? 'done' : ''}">
    <div class="plan-item-top" data-act="${editAct}" data-id="${i.id}" style="cursor:pointer">
      <div class="ico" style="width:42px;height:42px;border-radius:14px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none">${i.icon}</div>
      <div class="grow">
        <div style="font-weight:650;font-size:15px">${esc(i.name)}</div>
        <div class="small ${over ? 'neg' : 'muted'}">${subInfo}</div>
        ${!i.done && i.balanceAfter !== undefined
          ? `<div class="small" style="font-size:12px;margin-top:2px;color:${i.balanceAfter < 0 ? 'var(--neg)' : 'var(--muted)'}">после ${isInc ? 'получения' : 'оплаты'} на руках: <b>${money(i.balanceAfter)}</b>${i.balanceAfter < 0 ? ' ⚠️ не хватает' : ''}</div>`
          : ''}
      </div>
      <div style="text-align:right;flex:none">
        <div style="font-weight:750;font-size:15.5px;white-space:nowrap" class="${isInc ? 'pos' : ''}">${isInc ? '+' : '−'}${money(i.amount)}</div>
        ${i.done ? `<span class="badge ok" style="font-size:11px;padding:2px 7px">✓ закрыто</span>` : ''}
      </div>
    </div>
    <div class="plan-item-actions">
      ${i.done
        ? `<button class="btn sm" data-act="unmarkPlan" data-key="${i.key}" data-ym="${i.ym || i.date.slice(0, 7)}">↩️ Отменить отметку</button>`
        : `<button class="btn sm ${over ? 'danger' : 'primary'}" data-act="planDo" data-key="${i.key}" data-date="${i.date}">${isInc ? '💰 Зачислить' : '💳 Оплатить'}</button>
           <button class="btn sm" data-act="markPlanSilent" data-key="${i.key}" data-ym="${i.ym || i.date.slice(0, 7)}">✓ Уже ${isInc ? 'получил' : 'оплачен'}</button>`}
    </div>
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

/* =================== 1. ГЛАВНАЯ (ВСЁ В ОДНОМ ОКНЕ, УМНО И ПРОСТО) =================== */
function viewHome() {
  const f = forecast();
  const now = new Date();
  let h = '';

  // 1. ГЛАВНАЯ КАРТОЧКА: ДЕНЬГИ СЕЙЧАС + СКОЛЬКО ОСТАНЕТСЯ ПОСЛЕ ДОЛГОВ
  const netAfterAll = r2(f.total - f.oblMonth);
  h += `<section class="card hero">
    <div class="row-between">
      <span class="muted" style="font-size:13.5px">Всего денег сейчас</span>
      <button class="link" style="color:#fff;font-size:13px;opacity:.9" data-act="sub" data-sub="accounts">Изменить баланс ›</button>
    </div>
    <div class="big ${f.total < 0 ? 'neg' : ''}">${money(f.total)}</div>
    <div class="acc-chips">
      ${S.accounts.map(a => `<div class="acc-chip" data-act="editAccount" data-id="${a.id}">
        <span>${a.icon} ${esc(a.name)}${a.inTotal === false ? ' 🔒' : ''}</span>
        <b>${money(f.b[a.id])}</b>
      </div>`).join('')}
    </div>
    <div class="hero-summary">
      <div class="hero-box">
        <span>Ещё оплатить в ${MONTHS_SHORT[now.getMonth()]}.</span>
        <b>−${money(f.oblMonth)}</b>
      </div>
      <div class="hero-box">
        <span>Останется после оплат</span>
        <b style="color:${netAfterAll < 0 ? '#fecaca' : '#86efac'}">${money(netAfterAll)}</b>
      </div>
    </div>
  </section>`;

  // 2. СКОЛЬКО МОЖНО ТРАТИТЬ В ДЕНЬ + БЫСТРАЯ ЗАПИСЬ МЕЛОЧЕЙ В 1 КЛИК
  const pct = f.daily > 0 ? f.spentToday / f.daily * 100 : (f.spentToday > 0 ? 100 : 0);
  const leftToday = r2(f.daily - f.spentToday);
  const quickCats = topExpenseCategories();
  h += `<section class="card">
    <div class="card-title">
      <span>💡 Можно тратить в день</span>
      <span class="badge ${leftToday < 0 ? 'bad' : 'ok'}">${f.days} ${plural(f.days, DAY_FORMS)} ${f.nextInc ? 'до ЗП' : 'до конца мес.'}</span>
    </div>
    <div class="big2 ${f.daily < 0 ? 'neg' : ''}">${money(Math.max(0, f.daily))}</div>
    ${progressBar(pct, pctColor(pct))}
    <div class="row-between small">
      <span>Сегодня потрачено: <b>${money(f.spentToday)}</b></span>
      <span class="${leftToday < 0 ? 'neg' : 'pos'}">${f.daily > 0 ? (leftToday >= 0 ? 'свободно сегодня ' + money(leftToday) : 'перерасход ' + money(-leftToday)) : ''}</span>
    </div>
    <div class="btns">
      <button class="btn primary" data-act="quickAdd">➕ Записать трату</button>
      <button class="btn" data-act="quickAddIncome">💰 + Доход</button>
    </div>
    <div class="chips" style="padding:10px 0 0;margin:0">
      ${quickCats.map(c => `<button class="chip" style="padding:6px 11px;font-size:12.5px" data-act="quickCat" data-cat="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}
    </div>
  </section>`;

  // 3. ЕДИНЫЙ ПОЛНЫЙ СПИСОК НА МЕСЯЦ: ВСЕ КРЕДИТЫ, ДОЛГИ, ОБЯЗАТЕЛЬНЫЕ РАСХОДЫ И ЗП
  const allMonth = f.cur;
  const expensesMonth = allMonth.filter(i => i.kind !== 'income');
  const doneExpCount = expensesMonth.filter(i => i.done).length;
  const unpaidCount = allMonth.filter(i => !i.done).length;
  const doneCount = allMonth.filter(i => i.done).length;

  let shownItems = allMonth;
  if (nav.homeFilter === 'unpaid') shownItems = allMonth.filter(i => !i.done);
  else if (nav.homeFilter === 'done') shownItems = allMonth.filter(i => i.done);
  else {
    // В режиме «Все» сначала идут неоплаченные по дате, а ниже — уже закрытые в этом месяце
    shownItems = allMonth.filter(i => !i.done).concat(allMonth.filter(i => i.done));
  }

  h += `<section class="card">
    <div class="card-title" style="margin-bottom:6px">
      <span>🗓 План на ${MONTHS[now.getMonth()]} (все платежи)</span>
      <span class="badge ${doneExpCount === expensesMonth.length && expensesMonth.length > 0 ? 'ok' : ''}">${doneExpCount} из ${expensesMonth.length} оплачено</span>
    </div>
    <div class="muted small" style="margin-bottom:10px">
      Здесь показаны <b>все</b> ваши кредиты, долги, обязательные счета и зарплата за ${MONTHS[now.getMonth()]}. Нажмите на название, чтобы изменить.
    </div>

    ${allMonth.length > 0 ? `<div class="chips" style="padding-bottom:8px">
      <button class="chip ${nav.homeFilter === 'all' ? 'active' : ''}" data-act="homeFilter" data-v="all">Все (${allMonth.length})</button>
      <button class="chip ${nav.homeFilter === 'unpaid' ? 'active' : ''}" data-act="homeFilter" data-v="unpaid">Ждут оплаты (${unpaidCount})</button>
      <button class="chip ${nav.homeFilter === 'done' ? 'active' : ''}" data-act="homeFilter" data-v="done">Закрыты (${doneCount})</button>
    </div>` : ''}

    ${shownItems.length
      ? `<div class="list">${shownItems.map(planRow).join('')}</div>`
      : emptyBox('✅', allMonth.length
          ? (nav.homeFilter === 'unpaid' ? 'Все платежи за этот месяц уже закрыты!' : 'В этой вкладке пусто')
          : 'Добавьте ваши кредиты, обязательные счета и зарплату кнопками ниже:')}

    <div class="btns" style="margin-top:12px">
      <button class="btn sm" data-act="addDebt">+ Кредит / долг</button>
      <button class="btn sm" data-act="editBill">+ Обяз. счёт</button>
      <button class="btn sm" data-act="editIncome">+ Зарплата</button>
    </div>
  </section>`;

  // 4. РАСКРЫВАЮЩИЙСЯ ПОДРОБНЫЙ ПРОГНОЗ НА КОНЕЦ МЕСЯЦА
  h += `<details class="clean-details">
    <summary>🔮 Полный расчёт на конец месяца и все долги</summary>
    <div class="mt">
      <div class="kv"><span>Деньги сейчас</span><b>${money(f.total)}</b></div>
      <div class="kv"><span>Ещё придёт ЗП / доходов</span><b class="pos">+${money(f.incMonth)}</b></div>
      <div class="kv"><span>Ещё оплатить в этом месяце</span><b class="neg">−${money(f.oblMonth)}</b></div>
      <div class="kv total"><span>Останется к концу месяца</span><b class="${f.endMonth < 0 ? 'neg' : 'pos'}">${money(f.endMonth)}</b></div>
      ${f.avgDaily > 0 ? `<div class="kv"><span>С учётом ежедневных трат (~${money(f.avgDaily)}/дн)</span><b class="${f.endMonthReal < 0 ? 'neg' : ''}">${money(f.endMonthReal)}</b></div>` : ''}
      <div class="divider"></div>
      <div class="kv"><span>Всего осталось по всем долгам</span><b class="neg">${money(sum(activeOweDebts().map(debtRemaining)))}</b></div>
    </div>
  </details>`;

  return h;
}

/* =================== 2. ОПЕРАЦИИ =================== */
function viewOps() {
  const m = nav.opsMonth;
  return `<div class="month-switch">
      <button class="icon-btn" data-act="opsMonth" data-d="-1">‹</button>
      <b>${cap(MONTHS[m.getMonth()])} ${m.getFullYear()}</b>
      <button class="icon-btn" data-act="opsMonth" data-d="1">›</button>
    </div>
    <input class="search" id="opsSearch" placeholder="🔍 Поиск по записям…" value="${esc(nav.q)}">
    <div class="chips">${[['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы'], ['debt', 'Кредиты'], ['transfer', 'Переводы']].map(([k, l]) => `<button class="chip ${nav.opsType === k ? 'active' : ''}" data-act="opsType" data-v="${k}">${l}</button>`).join('')}</div>
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
  let h = `<div class="stats" style="margin-bottom:10px">
    <div class="stat"><span>Расходы за месяц</span><b>−${money(exp)}</b></div>
    <div class="stat"><span>Доходы за месяц</span><b class="pos">+${money(inc)}</b></div>
  </div>`;
  if (!list.length) return h + emptyBox('🧾', 'Записей пока нет. Нажмите синюю кнопку «+», чтобы записать трату.');
  const groups = {};
  list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  h += Object.entries(groups).map(([d, arr]) => {
    const dayExp = sum(arr.filter(t => t.type === 'expense'), 'amount');
    return `<div class="day-head"><span>${fmtDayHead(d)}</span><span>${dayExp ? '−' + money(dayExp) : ''}</span></div>
      <div class="card" style="padding:4px 14px;margin-bottom:6px"><div class="list">${arr.map(txRow).join('')}</div></div>`;
  }).join('');
  return h;
}
function afterOps() {
  const s = $('#opsSearch');
  if (s) s.oninput = () => { nav.q = s.value; $('#opsList').innerHTML = opsListHTML(); };
}

/* =================== 3. ДОЛГИ И КРЕДИТЫ (ЧИСТЫЕ КАРТОЧКИ) =================== */
function debtCard(d) {
  const rem = debtRemaining(d);
  const total = +d.total || rem;
  const paidPct = total > 0 ? clamp((total - rem) / total * 100, 0, 100) : 0;
  const k = DEBT_KINDS[d.kind] || DEBT_KINDS.credit;
  const lent = d.kind === 'lent';
  const po = +d.payment > 0 ? debtPayoffInfo(d) : null;
  const curYM = ym(new Date());
  const monthDone = isPlanDone('debt:' + d.id, curYM);

  let closeSummary = 'Без ежемесячного графика';
  if (rem <= 0) closeSummary = 'Полностью закрыт 🎉';
  else if (po && po.never) closeSummary = '⚠️ Платёж меньше %';
  else if (po) closeSummary = `Осталось ${po.months} ${plural(po.months, MONTH_FORMS)} (до ${fmtMonthYear(po.date)})`;

  return `<section class="card debt">
    <div class="head">
      <div class="ico">${k.i}</div>
      <div class="grow">
        <div style="font-weight:700;font-size:16.5px">${esc(d.name)}</div>
        <div class="muted small">${k.n}${d.payDay ? ` · оплата ${d.payDay}-го числа` : ''}</div>
      </div>
      ${!lent && rem > 0
        ? (monthDone
            ? `<button class="badge ok" style="border:0;cursor:pointer" data-act="unmarkPlan" data-key="debt:${d.id}" data-ym="${curYM}">✓ Оплачен</button>`
            : `<span class="badge wn">К оплате</span>`)
        : ''}
    </div>

    <div class="debt-pills">
      <div class="debt-pill">
        <span>${lent ? 'Мне должны' : 'Остаток долга'}</span>
        <b class="${lent ? 'pos' : ''}" style="font-size:17px">${money(rem)}</b>
      </div>
      <div class="debt-pill">
        <span>Платёж в месяц</span>
        <b style="font-size:17px">${+d.payment ? money(d.payment) : 'Свободный'}</b>
      </div>
    </div>

    ${total > rem ? progressBar(paidPct, 'var(--pos)') : '<div style="height:6px"></div>'}
    <div class="row-between small">
      <span>📅 <b>${closeSummary}</b></span>
      ${total > rem ? `<span class="muted">выплачено ${Math.round(paidPct)}%</span>` : ''}
    </div>

    <div class="btns">
      ${rem > 0 ? `<button class="btn sm primary" data-act="payDebt" data-id="${d.id}">${lent ? '💰 Вернули' : '💳 Оплатить'}</button>` : ''}
      ${!lent && rem > 0 && !monthDone ? `<button class="btn sm" data-act="markPlanSilent" data-key="debt:${d.id}" data-ym="${curYM}">✓ Уже оплачен</button>` : ''}
      <button class="btn sm" style="flex:0 0 auto" data-act="editDebt" data-id="${d.id}">⚙️ Изменить</button>
    </div>
  </section>`;
}

function viewDebts() {
  const owe = S.debts.filter(d => !d.closed && d.kind !== 'lent');
  const lent = S.debts.filter(d => !d.closed && d.kind === 'lent');
  const closed = S.debts.filter(d => d.closed);
  if (!S.debts.length) {
    return `<section class="card">${emptyBox('🏦', 'Добавьте ваши кредиты, рассрочки, кредитки или долги людям.<br><br>Вы сразу увидите, сколько месяцев осталось платить, когда каждый долг закроется и сколько денег остаётся после их оплаты.')}
      <button class="btn primary block" data-act="addDebt">+ Добавить долг или кредит</button></section>`;
  }
  const act = owe.filter(d => debtRemaining(d) > 0);
  const totalOwe = sum(act.map(debtRemaining));
  const monthly = sum(act, 'payment');
  const curYM = ym(new Date());
  const unpaidThisMonth = sum(act.filter(d => !isPlanDone('debt:' + d.id, curYM)).map(d => +d.payment > 0 ? +d.payment : debtRemaining(d)));
  const infos = act.map(d => +d.payment > 0 ? debtPayoffInfo(d) : null);
  const freedom = infos.filter(p => p && p.date).reduce((m, p) => !m || p.date > m ? p.date : m, null);

  let h = '';
  if (act.length) {
    h += `<section class="card">
      <div class="stats">
        <div class="stat"><span>Всего осталось</span><b class="neg">${money(totalOwe)}</b></div>
        <div class="stat"><span>Платежи по графику</span><b>${money(monthly)}/мес</b></div>
        <div class="stat"><span>Ещё платить в ${MONTHS_SHORT[new Date().getMonth()]}.</span><b class="${unpaidThisMonth > 0 ? 'warn' : 'pos'}">${unpaidThisMonth > 0 ? money(unpaidThisMonth) : '0 (всё оплачено)'}</b></div>
        <div class="stat"><span>Полное закрытие</span><b>${freedom ? cap(fmtMonthYear(freedom)) : '—'}</b></div>
      </div>
    </section>`;
  }
  h += owe.map(debtCard).join('');

  if (act.length >= 2) {
    h += `<details class="clean-details"><summary>🧠 Стратегия быстрого закрытия долгов</summary><div class="mt">${strategyInnerHTML()}</div></details>`;
  }
  if (lent.length) {
    h += `<div class="day-head" style="font-size:15px;color:var(--text)"><span>💸 Мне должны: ${money(sum(lent.map(debtRemaining)))}</span></div>` + lent.map(debtCard).join('');
  }
  if (closed.length) {
    h += `<button class="btn block ghost" data-act="toggleClosed">${nav.showClosed ? 'Скрыть' : 'Показать'} закрытые (${closed.length})</button><div style="height:10px"></div>`;
    if (nav.showClosed) h += closed.map(debtCard).join('');
  }
  return h;
}

function strategyInnerHTML() {
  const extra = nav.extra || 0;
  const av = simulateAll(extra, 'avalanche'), sn = simulateAll(extra, 'snowball');
  const now = new Date();
  const res = (r, title, desc) => {
    if (r.never) return `<div><h4>${title}</h4><div class="neg small">Увеличьте платежи</div></div>`;
    return `<div><h4>${title}</h4><div class="muted small">${desc}</div>
      <div class="mt"><b>Закроются все за ${r.months} ${plural(r.months, MONTH_FORMS)}</b> (${fmtMonthYear(addMonths(now, r.months - 1))})</div>
      <ol>${r.order.map(x => `<li>${esc(x.name)} — через ${x.closedAt} мес.</li>`).join('')}</ol></div>`;
  };
  return `<div class="muted small">Когда один кредит закрывается, направляйте его платёж на следующий:</div>
    <div class="field mt"><span>Если добавлять сверху в месяц:</span><input class="inp" id="extraInp" inputmode="decimal" value="${extra || ''}" placeholder="0"></div>
    <div class="strategy mt">
      ${res(sn, '⛄ Снежный ком (рекомендуется)', 'Сначала самый маленький долг — быстрое избавление от мелких кредитов')}
      ${res(av, '🏔 Лавина', 'Сначала кредит с самой высокой ставкой')}
    </div>`;
}

/* =================== 4. ОТЧЁТЫ =================== */
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
  const step = Math.ceil(buckets.length / 8);
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
  const small = R.exps.filter(t => !t.debtId && !t.plan && t.amount <= (+S.settings.smallLimit || 0));
  const smallSum = sum(small, 'amount');

  let h = `<div class="chips">${[['month', 'Этот месяц'], ['prev', 'Прошлый'], ['3m', '3 месяца'], ['year', 'Год'], ['all', 'Всё время'], ['custom', 'Даты…']].map(([k, l]) => `<button class="chip ${nav.rp === k ? 'active' : ''}" data-act="rp" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (nav.rp === 'custom') {
    h += `<div class="grid2" style="margin-bottom:12px"><label class="field"><span>С</span><input type="date" data-rdate="rFrom" value="${R.from}"></label><label class="field"><span>По</span><input type="date" data-rdate="rTo" value="${R.to}"></label></div>`;
  }
  h += `<section class="card"><div class="card-title">${esc(R.label)}</div>
    <div class="stats">
      <div class="stat"><span>Расходы</span><b>${money(R.exp)}</b></div>
      <div class="stat"><span>Доходы</span><b class="pos">${money(R.inc)}</b></div>
      <div class="stat"><span>В среднем в день</span><b>${money(avg)}</b></div>
      <div class="stat"><span>На мелочи (до ${money(S.settings.smallLimit)})</span><b>${money(smallSum)}</b></div>
    </div></section>`;

  h += `<section class="card"><div class="card-title">🍩 На что ушли деньги</div>`;
  if (R.cats.length) {
    h += `<div class="donut-wrap">${donutSVG(R.cats.map(x => ({ value: x.v, color: x.c.color })), moneyShort(R.exp), 'всего, ' + S.settings.currency)}</div><div class="list">`;
    h += R.cats.map(x => {
      const p = x.v / R.exp * 100;
      return `<div class="row" data-act="catDrill" data-id="${x.id}">
        <div class="ico" style="background:${x.c.color}22">${x.c.icon}</div>
        <div class="grow"><div class="t">${esc(x.c.name)}</div>
          <div class="s">${Math.round(p)}% от всех расходов</div>
          <div class="progress thin"><i style="width:${p}%;background:${x.c.color}"></i></div></div>
        <div class="amt">${money(x.v)}</div></div>`;
    }).join('') + '</div>';
  } else h += emptyBox('📭', 'За этот период расходов нет');
  h += `</section>`;

  if (R.exps.length) h += `<section class="card"><div class="card-title">📆 График расходов</div>${barsHTML(R.exps, R.from, R.to)}</section>`;

  h += `<section class="card"><div class="card-title">📤 Выгрузить отчёт</div>
    <div class="btns">
      <button class="btn" data-act="exportCSV">📄 Excel (CSV)</button>
      <button class="btn" data-act="printReport">🖨 PDF / Печать</button>
    </div></section>`;
  return h;
}

/* =================== 5. МЕНЮ (ЕЩЁ) =================== */
function viewMore() {
  const t = (sub, e, title, desc) => `<button class="tile" data-act="sub" data-sub="${sub}"><span class="e">${e}</span><b>${title}</b><span>${desc}</span></button>`;
  return `<div class="tiles">
    ${t('plans', '💼', 'ЗП и платежи', 'Зарплата, аванс, счета')}
    ${t('accounts', '💳', 'Мои счета', 'Карты и наличные')}
    ${t('categories', '🏷', 'Категории', 'Добавить или изменить')}
    ${t('budgets', '🎯', 'Лимиты', 'Бюджет на категории')}
    ${t('goals', '🐷', 'Копилка', 'Цели и накопления')}
    ${t('backupScr', '💾', 'Бэкап данных', 'Сохранить / перенести')}
    ${t('settings', '⚙️', 'Настройки', 'Валюта, тема, PIN')}
    ${t('help', '📲', 'Установка', 'Иконка на iPhone / Android')}
  </div>`;
}

function viewPlans() {
  const now = new Date(); const items = planItems(now);
  const incT = sum(S.incomes.filter(x => x.active !== false), 'amount');
  const billT = sum(S.bills.filter(x => x.active !== false), 'amount');
  const debtT = sum(activeOweDebts(), 'payment');
  let h = `<section class="card"><div class="card-title">🧮 Ежемесячный расклад</div>
    <div class="kv"><span>Доходы (ЗП, аванс)</span><b class="pos">+${money(incT)}</b></div>
    <div class="kv"><span>Кредиты и долги</span><b>−${money(debtT)}</b></div>
    <div class="kv"><span>Обязательные счета</span><b>−${money(billT)}</b></div>
    <div class="kv total"><span>Остаётся на жизнь</span><b class="${incT - debtT - billT < 0 ? 'neg' : 'pos'}">${money(incT - debtT - billT)}</b></div>
  </section>`;
  h += `<section class="card"><div class="card-title">💼 Мои доходы (ЗП, аванс) <button class="link" data-act="editIncome">+ Добавить</button></div>
    ${S.incomes.length ? `<div class="list">${S.incomes.map(x => `<div class="row" data-act="editIncome" data-id="${x.id}"><div class="ico">${cat(x.categoryId)?.icon || '💼'}</div><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">каждое ${x.day}-е число</div></div><div class="amt pos">+${money(x.amount)}</div></div>`).join('')}</div>` : emptyBox('💼', 'Нажмите «+ Добавить», чтобы указать зарплату и аванс')}
  </section>`;
  h += `<section class="card"><div class="card-title">🧾 Обязательные счета <button class="link" data-act="editBill">+ Добавить</button></div>
    ${S.bills.length ? `<div class="list">${S.bills.map(x => `<div class="row" data-act="editBill" data-id="${x.id}"><div class="ico">${cat(x.categoryId)?.icon || '🧾'}</div><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">каждое ${x.day}-е число</div></div><div class="amt">−${money(x.amount)}</div></div>`).join('')}</div>` : emptyBox('🧾', 'Квартплата, аренда, интернет, связь и т.д.')}
  </section>`;
  h += `<section class="card"><div class="card-title">📅 Все платежи в ${MONTHS[now.getMonth()]} (${items.length})</div>
    ${items.length ? `<div class="list">${items.map(planRow).join('')}</div>` : emptyBox('📅', 'Пока пусто')}</section>`;
  return h;
}

function viewBudgets() {
  const m = ym(new Date());
  const mTx = S.transactions.filter(t => t.type === 'expense' && t.date.slice(0, 7) === m);
  const cats = S.categories.filter(c => c.type === 'expense');
  return `<section class="card"><div class="card-title">🎯 Месячные лимиты</div>
    <div class="muted small">Укажите лимит на месяц для категорий, которые хотите контролировать:</div>
    <div class="list mt">${cats.map(c => {
      const l = +S.budgets[c.id] || 0; const sp = sum(mTx.filter(t => t.categoryId === c.id), 'amount');
      const p = l ? sp / l * 100 : 0;
      return `<div class="row" style="flex-wrap:wrap"><div class="ico" style="background:${c.color}22">${c.icon}</div>
        <div class="grow"><div class="t">${esc(c.name)}</div><div class="s">потрачено ${money(sp)}</div></div>
        <input class="inp budget-inp" inputmode="decimal" data-budget="${c.id}" value="${l || ''}" placeholder="лимит">
        ${l ? `<div style="flex-basis:100%"><div class="progress thin"><i style="width:${clamp(p, 0, 100)}%;background:${pctColor(p)}"></i></div></div>` : ''}
      </div>`;
    }).join('')}</div></section>`;
}

function viewGoals() {
  if (!S.goals.length) return `<section class="card">${emptyBox('🐷', 'Создайте цель для накоплений (например, «Подушка безопасности»).')}<button class="btn primary block" data-act="editGoal">+ Создать цель</button></section>`;
  return S.goals.map(g => {
    const p = g.target > 0 ? g.saved / g.target * 100 : 0;
    return `<section class="card"><div class="row" style="border:0;padding:0"><div class="ico">${g.icon || '🎯'}</div><div class="grow"><div class="t">${esc(g.name)}</div><div class="s">${money(g.saved)} из ${money(g.target)}</div></div><b>${Math.round(p)}%</b></div>
      ${progressBar(p, p >= 100 ? 'var(--pos)' : 'var(--accent)')}
      <div class="btns"><button class="btn sm primary" data-act="goalAdd" data-id="${g.id}">+ Пополнить</button><button class="btn sm" data-act="goalAdd" data-id="${g.id}" data-minus="1">− Снять</button><button class="btn sm" data-act="editGoal" data-id="${g.id}">Изменить</button></div></section>`;
  }).join('');
}

function viewAccounts() {
  const b = balances();
  return `<section class="card"><div class="card-title">Всего денег: ${money(totalBalance(b))}</div><div class="list">
    ${S.accounts.map(a => `<div class="row" data-act="editAccount" data-id="${a.id}"><div class="ico">${a.icon}</div><div class="grow"><div class="t">${esc(a.name)}</div><div class="s">Нажмите, чтобы изменить баланс</div></div><div class="amt ${b[a.id] < 0 ? 'neg' : ''}">${money(b[a.id])}</div></div>`).join('')}
  </div></section>
  <div class="btns"><button class="btn primary" data-act="editAccount">+ Новый счёт</button><button class="btn" data-act="transfer">🔁 Перевод</button></div>`;
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
    <label class="field"><span>Тема оформления</span><select data-set="theme"><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Тёмная</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Светлая</option></select></label>
    <label class="field"><span>Считать «мелочью» траты до:</span><input data-set="smallLimit" inputmode="decimal" value="${s.smallLimit}"></label>
  </section>
  <section class="card"><div class="card-title">🔄 Обновление (версия ${APP_VER})</div>
    <div class="btns"><button class="btn primary" data-act="forceUpdate">🔄 Обновить программу (данные сохранятся)</button></div>
  </section>
  <section class="card"><div class="card-title">🔒 Защита PIN-кодом</div>
    <div class="btns">${s.pin ? '<button class="btn" data-act="setPin">Сменить PIN</button><button class="btn danger" data-act="removePin">Убрать PIN</button>' : '<button class="btn" data-act="setPin">Установить PIN-код</button>'}</div>
  </section>
  <section class="card"><div class="card-title">🗂 Управление данными</div>
    <div class="btns"><button class="btn" data-act="sub" data-sub="backupScr">💾 Резервная копия</button><button class="btn danger" data-act="reset">Сбросить всё</button></div>
  </section>`;
}

function viewBackup() {
  const lb = S.settings.lastBackup;
  return `<section class="card"><div class="card-title">💾 Резервная копия</div>
    <div class="muted small">Сохраните файл копии в «Избранное» Telegram или в Файлы iPhone — тогда ваши данные никогда не потеряются даже при смене телефона.</div>
    <div class="kv mt"><span>Последняя копия</span><b>${lb ? new Date(lb).toLocaleString('ru-RU') : 'ещё не делалась'}</b></div>
    <div class="btns"><button class="btn primary" data-act="backup">⬇️ Сохранить копию</button><button class="btn" data-act="importData">⬆️ Загрузить из файла</button></div>
  </section>`;
}

function viewHelp() {
  return `<section class="card"><div class="card-title">🍏 Как установить на iPhone</div>
    <div class="insight"><span class="e">1</span><div>Откройте сайт в <b>Safari</b></div></div>
    <div class="insight"><span class="e">2</span><div>Нажмите внизу кнопку <b>«Поделиться» ⬆️</b></div></div>
    <div class="insight"><span class="e">3</span><div>Выберите <b>«На экран „Домой“»</b> → <b>«Добавить»</b></div></div>
    <div class="insight"><span class="e">4</span><div>Открывайте приложение с появившейся иконки — оно будет работать во весь экран без рамок браузера!</div></div>
  </section>`;
}

const VIEWS = {
  home: { title: 'ФинКонтроль', render: viewHome },
  ops: { title: 'Операции', render: viewOps, after: afterOps },
  debts: { title: 'Долги и кредиты', render: viewDebts, actions: () => '<button class="btn sm primary" data-act="addDebt">+ Добавить</button>' },
  reports: { title: 'Отчёты', render: viewReports },
  more: { title: 'Меню', render: viewMore },
  plans: { title: 'ЗП и платежи', render: viewPlans },
  budgets: { title: 'Лимиты', render: viewBudgets },
  goals: { title: 'Копилка', render: viewGoals, actions: () => S.goals.length ? '<button class="btn sm primary" data-act="editGoal">+ Цель</button>' : '' },
  accounts: { title: 'Мои счета', render: viewAccounts },
  categories: { title: 'Категории', render: viewCategories },
  settings: { title: 'Настройки', render: viewSettings },
  backupScr: { title: 'Резервная копия', render: viewBackup },
  help: { title: 'Установка', render: viewHelp },
};

function render() {
  document.documentElement.dataset.theme = S.settings.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = S.settings.theme === 'light' ? '#f1f5f9' : '#0b1020';
  const V = VIEWS[nav.sub || nav.tab] || VIEWS.home;
  $('#title').textContent = V.title;
  $('#topActions').innerHTML = V.actions ? V.actions() : '';
  $('#backBtn').classList.toggle('hidden', !nav.sub);
  $('#view').innerHTML = V.render();
  $$('.tabbar [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === nav.tab));
  if (V.after) V.after();
}

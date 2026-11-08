'use strict';
/* =========================================================
   ФинКонтроль — модальные окна (sheets), обработчики событий,
   экспорт, PIN-блокировка, онбординг и PWA
   ========================================================= */

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- Bottom Sheet Engine ---------- */
function openSheet(title, bodyHTML, onMount) {
  const wrap = $('#sheetWrap'), sh = $('#sheet');
  sh.innerHTML = `<div class="sheet-handle"></div>
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-act="closeSheet" aria-label="Закрыть">✕</button></div>
    <div class="sheet-body">${bodyHTML}</div>`;
  wrap.classList.remove('hidden');
  requestAnimationFrame(() => wrap.classList.add('open'));
  if (onMount) onMount(sh);
}

function closeSheet() {
  const wrap = $('#sheetWrap');
  wrap.classList.remove('open');
  setTimeout(() => { wrap.classList.add('hidden'); $('#sheet').innerHTML = ''; }, 200);
}

function emojiPickerHTML(targetSelector) {
  return `<div class="emoji-pick">${EMOJIS.map(e => `<button type="button" data-pick-emoji="${e}" data-target="${targetSelector}">${e}</button>`).join('')}</div>`;
}

function paletteHTML(name, current) {
  return `<div class="palette">${COLORS.map(c => `<label><input type="radio" name="${name}" value="${c}" ${c === current ? 'checked' : ''}><span class="sw" style="background:${c}"></span></label>`).join('')}</div>`;
}

/* =================== 1. ОПЕРАЦИИ (ТРАТЫ / ДОХОДЫ / ПЕРЕВОДЫ) =================== */
function openTxSheet(txId = null, presetType = 'expense') {
  const existing = txId ? S.transactions.find(t => t.id === txId) : null;
  const t = existing ? Object.assign({}, existing) : {
    type: presetType,
    amount: '',
    categoryId: presetType === 'income' ? 'c_salary' : 'c_food',
    accountId: S.settings.lastAccount || S.accounts[0]?.id || 'a_card',
    toAccountId: S.accounts[1]?.id || S.accounts[0]?.id || 'a_cash',
    date: todayStr(),
    note: '',
  };

  function catGridHTML(type, selectedId) {
    if (type === 'transfer') return '';
    const list = S.categories.filter(c => c.type === type);
    const sel = list.some(c => c.id === selectedId) ? selectedId : (list[0]?.id || '');
    return list.map(c => `<label class="cat-chip" style="--c:${c.color}">
      <input type="radio" name="categoryId" value="${c.id}" ${c.id === sel ? 'checked' : ''}>
      <span><b>${c.icon}</b>${esc(c.name)}</span>
    </label>`).join('');
  }

  const accOpts = sel => S.accounts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${a.icon} ${esc(a.name)} (${money(balances()[a.id])})</option>`).join('');

  const html = `<form id="txForm" class="form">
    <div class="seg">
      <label><input type="radio" name="type" value="expense" ${t.type === 'expense' ? 'checked' : ''}><span>Расход</span></label>
      <label><input type="radio" name="type" value="income" ${t.type === 'income' ? 'checked' : ''}><span>Доход</span></label>
      <label><input type="radio" name="type" value="transfer" ${t.type === 'transfer' ? 'checked' : ''}><span>Перевод</span></label>
    </div>
    <div>
      <input class="amount-input" name="amount" inputmode="decimal" placeholder="0 (можно 150+80)" value="${t.amount !== '' ? t.amount : ''}" required autocomplete="off">
      <div class="preview" id="txCalcPreview"></div>
    </div>
    <div id="catGridWrap" class="cat-grid">${catGridHTML(t.type, t.categoryId)}</div>
    <div class="grid2">
      <label class="field"><span id="fromAccLbl">${t.type === 'income' ? 'На счёт' : 'Со счёта'}</span>
        <select name="accountId">${accOpts(t.accountId)}</select></label>
      <label class="field ${t.type === 'transfer' ? '' : 'hidden'}" id="toAccField"><span>Куда перевести</span>
        <select name="toAccountId">${accOpts(t.toAccountId)}</select></label>
      <label class="field" id="dateField"><span>Дата</span>
        <input type="date" name="date" value="${t.date}" required></label>
    </div>
    <label class="field"><span>Комментарий (на что именно / мелочь)</span>
      <input name="note" placeholder="Напр.: кофе, хлеб, маршрутка, аптека…" value="${esc(t.note || '')}"></label>
    <div class="sheet-actions">
      ${existing ? `<button type="button" class="btn danger" id="delTxBtn">Удалить</button>` : ''}
      <button type="submit" class="btn primary grow">${existing ? 'Сохранить' : 'Добавить'}</button>
    </div>
  </form>`;

  openSheet(existing ? 'Редактировать операцию' : 'Новая операция', html, sh => {
    const form = $('#txForm', sh);
    const amtInp = form.elements.amount;
    const prev = $('#txCalcPreview', sh);
    if (!existing) setTimeout(() => amtInp.focus(), 180);

    amtInp.oninput = () => {
      const v = amtInp.value.trim();
      if (/[+\-*/]/.test(v)) {
        const res = r2(calc(v));
        prev.textContent = res > 0 ? '= ' + money(res) : '';
      } else prev.textContent = '';
    };

    $$('input[name="type"]', form).forEach(r => r.onchange = () => {
      const tp = form.elements.type.value;
      $('#catGridWrap', sh).innerHTML = catGridHTML(tp, tp === 'income' ? 'c_salary' : 'c_food');
      $('#toAccField', sh).classList.toggle('hidden', tp !== 'transfer');
      $('#fromAccLbl', sh).textContent = tp === 'income' ? 'На счёт' : 'Со счёта';
    });

    if (existing) {
      $('#delTxBtn', sh).onclick = () => {
        if (!confirm('Удалить эту операцию?')) return;
        S.transactions = S.transactions.filter(x => x.id !== existing.id);
        save(); closeSheet(); render(); toast('Операция удалена');
      };
    }

    form.onsubmit = e => {
      e.preventDefault();
      const amount = r2(calc(amtInp.value));
      if (!(amount > 0)) { toast('Введите сумму больше 0'); amtInp.focus(); return; }
      const tp = form.elements.type.value;
      const accountId = form.elements.accountId.value;
      const toAccountId = form.elements.toAccountId.value;
      if (tp === 'transfer' && accountId === toAccountId) {
        toast('Выберите разные счета для перевода'); return;
      }
      const categoryId = tp === 'transfer' ? '' : (form.elements.categoryId?.value || '');
      S.settings.lastAccount = accountId;

      if (existing) {
        Object.assign(existing, {
          type: tp, amount, categoryId, accountId,
          toAccountId: tp === 'transfer' ? toAccountId : '',
          date: form.elements.date.value || todayStr(),
          note: form.elements.note.value.trim(),
        });
      } else {
        S.transactions.push({
          id: uid(),
          type: tp, amount, categoryId, accountId,
          toAccountId: tp === 'transfer' ? toAccountId : '',
          date: form.elements.date.value || todayStr(),
          note: form.elements.note.value.trim(),
          createdAt: Date.now(),
        });
      }
      save(); closeSheet(); render();
      toast(existing ? 'Сохранено' : `${TYPE_N[tp]}: ${money(amount)}`);
    };
  });
}

/* =================== 2. ДОЛГИ И КРЕДИТЫ =================== */
function openDebtSheet(debtId = null) {
  const existing = debtId ? debtById(debtId) : null;
  const paidBefore = existing ? r2(debtPaidPrincipal(existing.id)) : 0;
  const curRem = existing ? debtRemaining(existing) : '';
  const d = existing ? Object.assign({}, existing) : {
    name: '', kind: 'credit', total: '', base: '', rate: '', payment: '', payDay: 15, note: '', closed: false,
  };

  const kindOpts = Object.entries(DEBT_KINDS).map(([k, v]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${v.i} ${v.n}</option>`).join('');

  const html = `<form id="debtForm" class="form">
    <div class="grid2">
      <label class="field"><span>Вид долга / кредита</span><select name="kind">${kindOpts}</select></label>
      <label class="field"><span>Название / кому</span><input name="name" placeholder="Сбер кредит, МФО, Ивану…" value="${esc(d.name)}" required></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Остаток долга СЕЙЧАС</span>
        <input name="remNow" inputmode="decimal" placeholder="Напр. 180000" value="${existing ? curRem : ''}" required>
        <small>Сколько осталось вернуть на сегодня</small></label>
      <label class="field"><span>Изначальная сумма (необяз.)</span>
        <input name="total" inputmode="decimal" placeholder="Для % прогресса" value="${d.total || ''}">
        <small>Сколько брали изначально</small></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Платёж в месяц</span>
        <input name="payment" inputmode="decimal" placeholder="Напр. 12500" value="${d.payment || ''}">
        <small>Оставьте 0, если без графика</small></label>
      <label class="field"><span>Число платежа (1–31)</span>
        <input name="payDay" type="number" min="1" max="31" value="${d.payDay || 15}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Ставка % годовых</span>
        <input name="rate" inputmode="decimal" placeholder="0 если без %" value="${d.rate || ''}">
        <small>Для рассрочки и долга другу — 0</small></label>
      <label class="field"><span>Срок в мес. (авторасчёт платежа)</span>
        <input name="calcMonths" type="number" min="1" max="360" placeholder="Напр. 24">
        <small>Подсчитает аннуитетный платёж</small></label>
    </div>
    <div class="preview" id="debtPreview"></div>
    <label class="field"><span>Заметка (договор, условия, телефон)</span>
      <input name="note" placeholder="Любые детали…" value="${esc(d.note || '')}"></label>
    ${existing ? `<label class="check"><input type="checkbox" name="closed" ${d.closed ? 'checked' : ''}><span>Перенести в архив (закрыт)</span></label>` : ''}
    <div class="sheet-actions">
      ${existing ? `<button type="button" class="btn danger" id="delDebtBtn">Удалить</button>` : ''}
      <button type="submit" class="btn primary grow">${existing ? 'Сохранить' : 'Добавить'}</button>
    </div>
  </form>`;

  openSheet(existing ? 'Редактировать долг' : 'Новый долг или кредит', html, sh => {
    const f = $('#debtForm', sh);
    const prev = $('#debtPreview', sh);

    function updatePreview() {
      const rem = calc(f.elements.remNow.value);
      const rate = calc(f.elements.rate.value);
      const m = parseInt(f.elements.calcMonths.value, 10);
      if (rem > 0 && m > 0 && document.activeElement === f.elements.calcMonths) {
        f.elements.payment.value = Math.ceil(annuity(rem, rate, m));
      }
      const pay = calc(f.elements.payment.value);
      if (!(rem > 0) || !(pay > 0)) { prev.innerHTML = ''; return; }
      const p = payoff(rem, rate, pay);
      if (!p) { prev.innerHTML = ''; return; }
      if (p.never) {
        prev.innerHTML = `<span class="neg">⚠️ Ежемесячный процент (${money(rem * rate / 1200)}) больше платежа! Долг никогда не закроется. Увеличьте платёж.</span>`;
      } else {
        const dt = addMonths(new Date(), p.months - 1);
        prev.innerHTML = `📅 Закроется через <b>${p.months} ${plural(p.months, MONTH_FORMS)}</b> (${fmtMonthYear(dt)})${p.interest > 0 ? ` · переплата процентами: <b>${money(p.interest)}</b>` : ' · без переплаты'}`;
      }
    }

    ['remNow', 'rate', 'payment', 'calcMonths'].forEach(k => f.elements[k].addEventListener('input', updatePreview));
    updatePreview();

    if (existing) {
      $('#delDebtBtn', sh).onclick = () => {
        if (!confirm(`Удалить «${existing.name}»? Операции платежей останутся в истории.`)) return;
        S.debts = S.debts.filter(x => x.id !== existing.id);
        save(); closeSheet(); render(); toast('Долг удалён');
      };
    }

    f.onsubmit = e => {
      e.preventDefault();
      const name = f.elements.name.value.trim();
      const remNow = r2(calc(f.elements.remNow.value));
      if (!name) { toast('Укажите название'); return; }
      const base = r2(remNow + paidBefore);
      const total = r2(Math.max(calc(f.elements.total.value) || 0, base));
      const obj = {
        id: existing ? existing.id : uid(),
        name,
        kind: f.elements.kind.value,
        base,
        total,
        rate: r2(calc(f.elements.rate.value)),
        payment: r2(calc(f.elements.payment.value)),
        payDay: clamp(parseInt(f.elements.payDay.value, 10) || 1, 1, 31),
        note: f.elements.note.value.trim(),
        closed: existing ? !!f.elements.closed?.checked : false,
      };
      if (existing) Object.assign(existing, obj);
      else S.debts.push(obj);
      save(); closeSheet(); render(); toast(existing ? 'Изменения сохранены' : 'Долг добавлен');
    };
  });
}

/* ---------- Внесение платежа по долгу / кредиту ---------- */
function openPayDebtSheet(debtId, planDate = null) {
  const d = debtById(debtId);
  if (!d) return;
  const rem = debtRemaining(d);
  const lent = d.kind === 'lent';
  const monthlyInterest = r2(rem * ((+d.rate || 0) / 1200));
  const defaultAmt = +d.payment > 0 ? Math.min(+d.payment, r2(rem + monthlyInterest)) : rem;
  const accOpts = S.accounts.map(a => `<option value="${a.id}" ${a.id === (S.settings.lastAccount || S.accounts[0]?.id) ? 'selected' : ''}>${a.icon} ${esc(a.name)} (${money(balances()[a.id])})</option>`).join('');

  const html = `<form id="payDebtForm" class="form">
    <div class="preview">
      <b>${esc(d.name)}</b> · остаток долга: <b>${money(rem)}</b>
      ${monthlyInterest > 0 ? `<br><span class="muted small">Начисленные проценты за месяц (${d.rate}% годовых): ~${money(monthlyInterest)}</span>` : ''}
    </div>
    <div class="grid2">
      <label class="field"><span>${lent ? 'Сколько вам вернули' : 'Сумма платежа'}</span>
        <input name="amount" inputmode="decimal" value="${defaultAmt || ''}" required></label>
      <label class="field"><span>Из них в счёт основного долга</span>
        <input name="principal" inputmode="decimal" value="${r2(Math.max(0, defaultAmt - monthlyInterest))}" required>
        <small>На сколько уменьшится сам долг</small></label>
    </div>
    <div class="grid2">
      <label class="field"><span>${lent ? 'На счёт' : 'Со счёта'}</span><select name="accountId">${accOpts}</select></label>
      <label class="field"><span>Дата</span><input type="date" name="date" value="${planDate || todayStr()}" required></label>
    </div>
    <label class="field"><span>Комментарий</span><input name="note" placeholder="Ежемесячный платёж / досрочное погашение"></label>
    <div class="sheet-actions"><button type="submit" class="btn primary grow">${lent ? 'Записать возврат' : 'Провести платёж'}</button></div>
  </form>`;

  openSheet(lent ? 'Возврат долга мне' : 'Платёж по долгу / кредиту', html, sh => {
    const f = $('#payDebtForm', sh);
    f.elements.amount.oninput = () => {
      const a = calc(f.elements.amount.value);
      f.elements.principal.value = r2(Math.max(0, a - monthlyInterest));
    };
    f.onsubmit = e => {
      e.preventDefault();
      const amount = r2(calc(f.elements.amount.value));
      const principal = r2(calc(f.elements.principal.value));
      if (!(amount > 0)) { toast('Введите сумму'); return; }
      const dt = f.elements.date.value || todayStr();
      S.transactions.push({
        id: uid(),
        type: lent ? 'income' : 'expense',
        amount,
        principal,
        categoryId: lent ? 'c_debtin' : 'c_debt',
        accountId: f.elements.accountId.value,
        date: dt,
        debtId: d.id,
        plan: 'debt:' + d.id,
        note: f.elements.note.value.trim(),
        createdAt: Date.now(),
      });
      if (debtRemaining(d) <= 0.01) {
        d.closed = true;
        toast('🎉 Поздравляем! Долг полностью закрыт!');
      } else {
        toast('Платёж проведён. Остаток: ' + money(debtRemaining(d)));
      }
      save(); closeSheet(); render();
    };
  });
}

function openDebtHistorySheet(debtId) {
  const d = debtById(debtId);
  if (!d) return;
  const list = S.transactions.filter(t => t.debtId === debtId).sort((a, b) => b.date.localeCompare(a.date));
  const totalPaid = sum(list, 'amount');
  const html = `<div class="preview" style="margin-bottom:10px">Всего платежей: <b>${list.length}</b> на сумму <b>${money(totalPaid)}</b> · Остаток: <b>${money(debtRemaining(d))}</b></div>
    ${list.length ? `<div class="list">${list.map(txRow).join('')}</div>` : emptyBox('📭', 'Платежей по этому долгу ещё не было')}`;
  openSheet('История: ' + d.name, html);
}

/* =================== 3. РЕГУЛЯРНЫЕ ДОХОДЫ И ОБЯЗАТЕЛЬНЫЕ ПЛАТЕЖИ =================== */
function openIncomeSheet(id = null) {
  const existing = id ? S.incomes.find(x => x.id === id) : null;
  const x = existing || { name: '', amount: '', day: 10, accountId: S.accounts[0]?.id || 'a_card', categoryId: 'c_salary', active: true };
  const incCats = S.categories.filter(c => c.type === 'income').map(c => `<option value="${c.id}" ${c.id === x.categoryId ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
  const accs = S.accounts.map(a => `<option value="${a.id}" ${a.id === x.accountId ? 'selected' : ''}>${a.icon} ${esc(a.name)}</option>`).join('');

  const html = `<form id="incForm" class="form">
    <label class="field"><span>Название дохода</span><input name="name" placeholder="Зарплата, Аванс, Пенсия, Подработка…" value="${esc(x.name)}" required></label>
    <div class="grid2">
      <label class="field"><span>Сумма (на руки)</span><input name="amount" inputmode="decimal" placeholder="Напр. 45000" value="${x.amount}" required></label>
      <label class="field"><span>День месяца (1–31)</span><input name="day" type="number" min="1" max="31" value="${x.day}" required></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Категория</span><select name="categoryId">${incCats}</select></label>
      <label class="field"><span>На какой счёт</span><select name="accountId">${accs}</select></label>
    </div>
    <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}><span>Активен (учитывать в прогнозе)</span></label>
    <div class="sheet-actions">
      ${existing ? `<button type="button" class="btn danger" id="delIncBtn">Удалить</button>` : ''}
      <button type="submit" class="btn primary grow">Сохранить</button>
    </div>
  </form>`;

  openSheet(existing ? 'Редактировать доход' : 'Регулярный доход (ЗП / аванс)', html, sh => {
    const f = $('#incForm', sh);
    if (existing) {
      $('#delIncBtn', sh).onclick = () => {
        S.incomes = S.incomes.filter(i => i.id !== existing.id);
        save(); closeSheet(); render(); toast('Удалено');
      };
    }
    f.onsubmit = e => {
      e.preventDefault();
      const obj = {
        id: existing ? existing.id : uid(),
        name: f.elements.name.value.trim() || 'Доход',
        amount: r2(calc(f.elements.amount.value)),
        day: clamp(parseInt(f.elements.day.value, 10) || 1, 1, 31),
        categoryId: f.elements.categoryId.value,
        accountId: f.elements.accountId.value,
        active: f.elements.active.checked,
      };
      if (existing) Object.assign(existing, obj);
      else S.incomes.push(obj);
      save(); closeSheet(); render(); toast('Доход сохранён');
    };
  });
}

function openBillSheet(id = null) {
  const existing = id ? S.bills.find(x => x.id === id) : null;
  const x = existing || { name: '', amount: '', day: 20, accountId: S.accounts[0]?.id || 'a_card', categoryId: 'c_home', active: true };
  const expCats = S.categories.filter(c => c.type === 'expense').map(c => `<option value="${c.id}" ${c.id === x.categoryId ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
  const accs = S.accounts.map(a => `<option value="${a.id}" ${a.id === x.accountId ? 'selected' : ''}>${a.icon} ${esc(a.name)}</option>`).join('');

  const html = `<form id="billForm" class="form">
    <label class="field"><span>Название платежа</span><input name="name" placeholder="Квартплата, Интернет, Аренда, Садик…" value="${esc(x.name)}" required></label>
    <div class="grid2">
      <label class="field"><span>Сумма в месяц</span><input name="amount" inputmode="decimal" placeholder="Напр. 5500" value="${x.amount}" required></label>
      <label class="field"><span>День оплаты (1–31)</span><input name="day" type="number" min="1" max="31" value="${x.day}" required></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Категория</span><select name="categoryId">${expCats}</select></label>
      <label class="field"><span>Со счёта</span><select name="accountId">${accs}</select></label>
    </div>
    <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}><span>Активен (резервировать деньги под него)</span></label>
    <div class="sheet-actions">
      ${existing ? `<button type="button" class="btn danger" id="delBillBtn">Удалить</button>` : ''}
      <button type="submit" class="btn primary grow">Сохранить</button>
    </div>
  </form>`;

  openSheet(existing ? 'Редактировать платёж' : 'Обязательный ежемесячный платёж', html, sh => {
    const f = $('#billForm', sh);
    if (existing) {
      $('#delBillBtn', sh).onclick = () => {
        S.bills = S.bills.filter(i => i.id !== existing.id);
        save(); closeSheet(); render(); toast('Удалено');
      };
    }
    f.onsubmit = e => {
      e.preventDefault();
      const obj = {
        id: existing ? existing.id : uid(),
        name: f.elements.name.value.trim() || 'Платёж',
        amount: r2(calc(f.elements.amount.value)),
        day: clamp(parseInt(f.elements.day.value, 10) || 1, 1, 31),
        categoryId: f.elements.categoryId.value,
        accountId: f.elements.accountId.value,
        active: f.elements.active.checked,
      };
      if (existing) Object.assign(existing, obj);
      else S.bills.push(obj);
      save(); closeSheet(); render(); toast('Платёж сохранён');
    };
  });
}

function executePlanItem(key, dateStr) {
  const [kind, id] = key.split(':');
  if (kind === 'debt') { openPayDebtSheet(id, dateStr); return; }
  const item = kind === 'inc' ? S.incomes.find(x => x.id === id) : S.bills.find(x => x.id === id);
  if (!item) return;
  const isInc = kind === 'inc';
  const accs = S.accounts.map(a => `<option value="${a.id}" ${a.id === item.accountId ? 'selected' : ''}>${a.icon} ${esc(a.name)}</option>`).join('');
  const html = `<form id="planExecForm" class="form">
    <div class="preview"><b>${esc(item.name)}</b></div>
    <div class="grid2">
      <label class="field"><span>Фактическая сумма</span><input name="amount" inputmode="decimal" value="${item.amount}" required></label>
      <label class="field"><span>Дата</span><input type="date" name="date" value="${todayStr()}" required></label>
    </div>
    <label class="field"><span>${isInc ? 'На счёт' : 'Со счёта'}</span><select name="accountId">${accs}</select></label>
    <div class="sheet-actions"><button type="submit" class="btn primary grow">${isInc ? 'Зачислить доход' : 'Записать оплату'}</button></div>
  </form>`;

  openSheet(isInc ? 'Получение дохода' : 'Оплата обязательного платежа', html, sh => {
    const f = $('#planExecForm', sh);
    f.onsubmit = e => {
      e.preventDefault();
      const amount = r2(calc(f.elements.amount.value));
      if (!(amount > 0)) return;
      // привязываем к месяцу плановой даты, чтобы отметилось выполненным в текущем месяце
      const txDate = f.elements.date.value || todayStr();
      S.transactions.push({
        id: uid(),
        type: isInc ? 'income' : 'expense',
        amount,
        categoryId: item.categoryId || (isInc ? 'c_salary' : 'c_home'),
        accountId: f.elements.accountId.value,
        date: txDate.slice(0, 7) === dateStr.slice(0, 7) ? txDate : dateStr,
        note: item.name,
        plan: key,
        createdAt: Date.now(),
      });
      save(); closeSheet(); render();
      toast((isInc ? '+' : '−') + money(amount) + ' проведено');
    };
  });
}

/* =================== 4. СЧЕТА, КАТЕГОРИИ, ЦЕЛИ =================== */
function openAccountSheet(id = null) {
  const existing = id ? acc(id) : null;
  const curBal = existing ? balances()[existing.id] : 0;
  const a = existing || { name: '', icon: '💳', initial: 0, inTotal: true };

  const html = `<form id="accForm" class="form">
    <div class="grid2">
      <label class="field"><span>Название счёта</span><input name="name" placeholder="Карта ЗП, Наличные, Копилка…" value="${esc(a.name)}" required></label>
      <label class="field"><span>Иконка</span><input name="icon" id="accIconInp" value="${esc(a.icon)}" maxlength="4"></label>
    </div>
    ${emojiPickerHTML('#accIconInp')}
    <label class="field"><span>Текущий баланс на счёте сейчас</span>
      <input name="currentBalance" inputmode="decimal" value="${existing ? curBal : ''}" placeholder="0">
      <small>Приложение автоматически подстроит начальный остаток под эту сумму</small></label>
    <label class="check"><input type="checkbox" name="inTotal" ${a.inTotal !== false ? 'checked' : ''}>
      <span>Учитывать в «Всего денег» и дневном лимите (снимите для копилки/неприкосновенного запаса)</span></label>
    <div class="sheet-actions">
      ${existing && S.accounts.length > 1 ? `<button type="button" class="btn danger" id="delAccBtn">Удалить</button>` : ''}
      <button type="submit" class="btn primary grow">Сохранить</button>
    </div>
  </form>`;

  openSheet(existing ? 'Настроить счёт' : 'Новый счёт', html, sh => {
    const f = $('#accForm', sh);
    if (existing && $('#delAccBtn', sh)) {
      $('#delAccBtn', sh).onclick = () => {
        if (!confirm(`Удалить счёт «${existing.name}»?`)) return;
        S.accounts = S.accounts.filter(x => x.id !== existing.id);
        save(); closeSheet(); render(); toast('Счёт удалён');
      };
    }
    f.onsubmit = e => {
      e.preventDefault();
      const targetBal = r2(calc(f.elements.currentBalance.value));
      if (existing) {
        const delta = r2(targetBal - curBal);
        existing.name = f.elements.name.value.trim() || 'Счёт';
        existing.icon = f.elements.icon.value.trim() || '💳';
        existing.initial = r2((+existing.initial || 0) + delta);
        existing.inTotal = f.elements.inTotal.checked;
      } else {
        S.accounts.push({
          id: uid(),
          name: f.elements.name.value.trim() || 'Счёт',
          icon: f.elements.icon.value.trim() || '💳',
          initial: targetBal,
          inTotal: f.elements.inTotal.checked,
        });
      }
      save(); closeSheet(); render(); toast('Счёт сохранён');
    };
  });
}

function openCatSheet(id = null) {
  const existing = id ? cat(id) : null;
  const c = existing || { name: '', icon: '🛒', color: COLORS[0], type: nav.catTab || 'expense' };
  const isSys = existing && SYSTEM_CATS.includes(existing.id);

  const html = `<form id="catForm" class="form">
    <div class="grid2">
      <label class="field"><span>Название категории</span><input name="name" value="${esc(c.name)}" placeholder="Напр. Шаурма, Маркетплейсы…" required></label>
      <label class="field"><span>Иконка</span><input name="icon" id="catIconInp" value="${esc(c.icon)}" maxlength="4"></label>
    </div>
    ${emojiPickerHTML('#catIconInp')}
    <label class="field"><span>Цвет</span>${paletteHTML('color', c.color)}</label>
    ${!existing ? `<label class="field"><span>Тип</span><select name="type"><option value="expense" ${c.type === 'expense' ? 'selected' : ''}>Расход</option><option value="income" ${c.type === 'income' ? 'selected' : ''}>Доход</option></select></label>` : ''}
    <div class="sheet-actions">
      ${existing && !isSys ? `<button type="button" class="btn danger" id="delCatBtn">Удалить</button>` : ''}
      <button type="submit" class="btn primary grow">Сохранить</button>
    </div>
  </form>`;

  openSheet(existing ? 'Изменить категорию' : 'Новая категория', html, sh => {
    const f = $('#catForm', sh);
    if (existing && !isSys && $('#delCatBtn', sh)) {
      $('#delCatBtn', sh).onclick = () => {
        if (!confirm(`Удалить категорию «${existing.name}»?`)) return;
        S.categories = S.categories.filter(x => x.id !== existing.id);
        delete S.budgets[existing.id];
        save(); closeSheet(); render(); toast('Категория удалена');
      };
    }
    f.onsubmit = e => {
      e.preventDefault();
      const color = f.elements.color?.value || COLORS[0];
      if (existing) {
        existing.name = f.elements.name.value.trim() || existing.name;
        existing.icon = f.elements.icon.value.trim() || existing.icon;
        existing.color = color;
      } else {
        S.categories.push({
          id: uid(),
          name: f.elements.name.value.trim() || 'Категория',
          icon: f.elements.icon.value.trim() || '📦',
          color,
          type: f.elements.type.value,
        });
      }
      save(); closeSheet(); render(); toast('Категория сохранена');
    };
  });
}

function openGoalSheet(id = null) {
  const existing = id ? S.goals.find(g => g.id === id) : null;
  const g = existing || { name: '', icon: '🐷', target: '', saved: 0, deadline: '' };

  const html = `<form id="goalForm" class="form">
    <div class="grid2">
      <label class="field"><span>Название цели</span><input name="name" placeholder="Подушка безопасности, Отпуск…" value="${esc(g.name)}" required></label>
      <label class="field"><span>Иконка</span><input name="icon" id="goalIconInp" value="${esc(g.icon)}" maxlength="4"></label>
    </div>
    ${emojiPickerHTML('#goalIconInp')}
    <div class="grid2">
      <label class="field"><span>Нужно накопить</span><input name="target" inputmode="decimal" value="${g.target}" required></label>
      <label class="field"><span>Уже накоплено</span><input name="saved" inputmode="decimal" value="${g.saved || 0}"></label>
    </div>
    <label class="field"><span>К какой дате (необязательно)</span><input type="date" name="deadline" value="${g.deadline || ''}"></label>
    <div class="sheet-actions">
      ${existing ? `<button type="button" class="btn danger" id="delGoalBtn">Удалить</button>` : ''}
      <button type="submit" class="btn primary grow">Сохранить</button>
    </div>
  </form>`;

  openSheet(existing ? 'Редактировать цель' : 'Новая финансовая цель', html, sh => {
    const f = $('#goalForm', sh);
    if (existing) {
      $('#delGoalBtn', sh).onclick = () => {
        S.goals = S.goals.filter(x => x.id !== existing.id);
        save(); closeSheet(); render(); toast('Цель удалена');
      };
    }
    f.onsubmit = e => {
      e.preventDefault();
      const obj = {
        id: existing ? existing.id : uid(),
        name: f.elements.name.value.trim() || 'Цель',
        icon: f.elements.icon.value.trim() || '🐷',
        target: r2(calc(f.elements.target.value)),
        saved: r2(calc(f.elements.saved.value)),
        deadline: f.elements.deadline.value || '',
      };
      if (existing) Object.assign(existing, obj);
      else S.goals.push(obj);
      save(); closeSheet(); render(); toast('Цель сохранена');
    };
  });
}

function openGoalDeltaSheet(id, isMinus) {
  const g = S.goals.find(x => x.id === id);
  if (!g) return;
  const html = `<form id="goalDeltaForm" class="form">
    <div class="preview">${g.icon} <b>${esc(g.name)}</b>: сейчас ${money(g.saved)} из ${money(g.target)}</div>
    <label class="field"><span>Сумма ${isMinus ? 'снятия' : 'пополнения'}</span><input name="amt" inputmode="decimal" required></label>
    <div class="sheet-actions"><button type="submit" class="btn primary grow">${isMinus ? 'Снять' : 'Пополнить'}</button></div>
  </form>`;
  openSheet(isMinus ? 'Снять с цели' : 'Пополнить цель', html, sh => {
    const f = $('#goalDeltaForm', sh);
    setTimeout(() => f.elements.amt.focus(), 180);
    f.onsubmit = e => {
      e.preventDefault();
      const v = r2(calc(f.elements.amt.value));
      if (!(v > 0)) return;
      g.saved = Math.max(0, r2(g.saved + (isMinus ? -v : v)));
      save(); closeSheet(); render(); toast('Готово: ' + money(g.saved));
    };
  });
}

function openCatDrillSheet(catId) {
  const R = reportData();
  const c = cat(catId) || { name: 'Без категории', icon: '❔' };
  const list = R.exps.filter(t => t.categoryId === catId).sort((a, b) => b.date.localeCompare(a.date));
  const html = `<div class="preview" style="margin-bottom:10px">${esc(R.label)} · <b>${list.length} опер.</b> на сумму <b>${money(sum(list, 'amount'))}</b></div>
    <div class="list">${list.map(txRow).join('')}</div>`;
  openSheet(`${c.icon} ${c.name}`, html);
}

/* =================== 5. ЭКСПОРТ / БЭКАП / ПЕЧАТЬ =================== */
function doBackup() {
  S.settings.lastBackup = Date.now();
  save();
  const fname = `finkontrol_backup_${todayStr()}.json`;
  saveFile(fname, JSON.stringify(S, null, 2), 'application/json').then(() => render());
}

function printCurrentReport() {
  const R = reportData();
  const f = forecast();
  const owe = activeOweDebts();
  const area = $('#printArea');
  area.innerHTML = `
    <h1>ФинКонтроль — Финансовый отчёт (${esc(R.label)})</h1>
    <div>Сформирован: ${new Date().toLocaleDateString('ru-RU')} · Баланс счетов: <b>${money(f.total)}</b></div>
    <h2>1. Итоги за период (${fmtDate(R.from)} — ${fmtDate(R.to)})</h2>
    <table>
      <tr><th>Доходы</th><th>Расходы</th><th>Остаток (сальдо)</th></tr>
      <tr><td>${money(R.inc)}</td><td>${money(R.exp)}</td><td>${money(R.inc - R.exp)}</td></tr>
    </table>
    <h2>2. Расходы по категориям</h2>
    <table>
      <tr><th>Категория</th><th class="r">Сумма</th><th class="r">Доля</th></tr>
      ${R.cats.map(x => `<tr><td>${x.c.icon} ${esc(x.c.name)}</td><td class="r">${money(x.v)}</td><td class="r">${(x.v / (R.exp || 1) * 100).toFixed(1)}%</td></tr>`).join('')}
    </table>
    ${owe.length ? `<h2>3. Активные кредиты и долги</h2>
    <table>
      <tr><th>Название</th><th class="r">Остаток</th><th class="r">Платёж/мес</th><th>Ставка</th></tr>
      ${owe.map(d => `<tr><td>${esc(d.name)}</td><td class="r">${money(debtRemaining(d))}</td><td class="r">${money(d.payment)}</td><td>${d.rate || 0}%</td></tr>`).join('')}
    </table>` : ''}
    <h2>4. Детализация операций (${R.list.length})</h2>
    <table>
      <tr><th>Дата</th><th>Категория / Счёт</th><th>Комментарий</th><th class="r">Сумма</th></tr>
      ${R.list.slice().sort((a, b) => b.date.localeCompare(a.date)).map(t => `<tr>
        <td>${t.date}</td>
        <td>${esc(t.type === 'transfer' ? 'Перевод' : (cat(t.categoryId)?.name || ''))} (${esc(acc(t.accountId)?.name || '')})</td>
        <td>${esc(t.note || '')}</td>
        <td class="r">${t.type === 'expense' ? '−' : t.type === 'income' ? '+' : ''}${money(t.amount)}</td>
      </tr>`).join('')}
    </table>`;
  window.print();
}

/* =================== 6. ОНБОРДИНГ И PIN =================== */
function checkOnboarding() {
  if (S.settings.onboarded) return;
  const html = `<form id="onbForm" class="form">
    <div class="muted small">Давайте за 20 секунд настроим приложение под вас (всё можно изменить позже):</div>
    <label class="field"><span>Ваша валюта</span>
      <select name="currency">${CURRENCIES.map(([v, l]) => `<option value="${v}" ${S.settings.currency === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="field"><span>Сейчас на карте</span><input name="card" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Сейчас наличными</span><input name="cash" inputmode="decimal" placeholder="0"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Зарплата в месяц</span><input name="salary" inputmode="decimal" placeholder="Напр. 60000"></label>
      <label class="field"><span>День ЗП (1–31)</span><input name="salDay" type="number" min="1" max="31" value="10"></label>
    </div>
    <div class="sheet-actions"><button type="submit" class="btn primary grow">Начать пользоваться</button></div>
  </form>`;

  openSheet('👋 Добро пожаловать в ФинКонтроль', html, sh => {
    const f = $('#onbForm', sh);
    f.onsubmit = e => {
      e.preventDefault();
      S.settings.currency = f.elements.currency.value;
      S.settings.onboarded = true;
      const card = acc('a_card'), cash = acc('a_cash');
      if (card) card.initial = r2(calc(f.elements.card.value));
      if (cash) cash.initial = r2(calc(f.elements.cash.value));
      const sal = r2(calc(f.elements.salary.value));
      if (sal > 0 && !S.incomes.length) {
        S.incomes.push({ id: uid(), name: 'Зарплата', amount: sal, day: clamp(parseInt(f.elements.salDay.value, 10) || 10, 1, 31), accountId: 'a_card', categoryId: 'c_salary', active: true });
      }
      save(); closeSheet(); render();
    };
  });
}

function showLockScreen() {
  if (!S.settings.pin) return;
  const lock = $('#lock');
  let entered = '';
  const draw = () => {
    lock.innerHTML = `<div class="lock-box">
      <div class="lock-logo">🔒</div>
      <h3>Введите PIN-код</h3>
      <div class="dots">${[0, 1, 2, 3].map(i => `<i class="${entered.length > i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}
      </div>
    </div>`;
  };
  draw();
  lock.classList.remove('hidden');
  lock.onclick = e => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    if (k === '⌫') entered = entered.slice(0, -1);
    else if (entered.length < 4) entered += k;
    draw();
    if (entered.length === 4) {
      if (hashPin(entered) === S.settings.pin) lock.classList.add('hidden');
      else { entered = ''; toast('Неверный PIN'); draw(); }
    }
  };
}

/* =================== 7. ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ =================== */
document.addEventListener('click', e => {
  const emojiBtn = e.target.closest('[data-pick-emoji]');
  if (emojiBtn) {
    const inp = $(emojiBtn.dataset.target);
    if (inp) inp.value = emojiBtn.dataset.pickEmoji;
    return;
  }

  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    nav.tab = tabBtn.dataset.tab;
    nav.sub = null;
    render();
    window.scrollTo(0, 0);
    return;
  }

  const actEl = e.target.closest('[data-act]');
  if (!actEl) return;
  const act = actEl.dataset.act;
  if (actEl.tagName === 'A') e.preventDefault();

  switch (act) {
    case 'back': nav.sub = null; render(); break;
    case 'sub': nav.sub = actEl.dataset.sub; render(); window.scrollTo(0, 0); break;
    case 'goTab': nav.tab = actEl.dataset.tab2; nav.sub = null; render(); window.scrollTo(0, 0); break;
    case 'closeSheet': closeSheet(); break;
    case 'quickAdd': openTxSheet(null, 'expense'); break;
    case 'editTx': openTxSheet(actEl.dataset.id); break;
    case 'transfer': openTxSheet(null, 'transfer'); break;
    case 'dismissStart': S.settings.startDismissed = true; save(); render(); break;
    case 'startStep': {
      const g = actEl.dataset.go;
      if (g === 'plans') { nav.sub = 'plans'; render(); }
      else if (g === 'debts') { nav.tab = 'debts'; nav.sub = null; render(); openDebtSheet(); }
      else if (g === 'quick') openTxSheet(null, 'expense');
      break;
    }
    case 'opsMonth': nav.opsMonth = addMonths(nav.opsMonth, +actEl.dataset.d); render(); break;
    case 'opsType': nav.opsType = actEl.dataset.v; render(); break;
    case 'addDebt': openDebtSheet(null); break;
    case 'editDebt': openDebtSheet(actEl.dataset.id); break;
    case 'payDebt': openPayDebtSheet(actEl.dataset.id); break;
    case 'debtHistory': openDebtHistorySheet(actEl.dataset.id); break;
    case 'toggleClosed': nav.showClosed = !nav.showClosed; render(); break;
    case 'planDo': executePlanItem(actEl.dataset.key, actEl.dataset.date); break;
    case 'editIncome': openIncomeSheet(actEl.dataset.id || null); break;
    case 'editBill': openBillSheet(actEl.dataset.id || null); break;
    case 'editAccount': openAccountSheet(actEl.dataset.id || null); break;
    case 'catTab': nav.catTab = actEl.dataset.v; render(); break;
    case 'editCat': openCatSheet(actEl.dataset.id || null); break;
    case 'editGoal': openGoalSheet(actEl.dataset.id || null); break;
    case 'goalAdd': openGoalDeltaSheet(actEl.dataset.id, !!actEl.dataset.minus); break;
    case 'rp': nav.rp = actEl.dataset.v; render(); break;
    case 'catDrill': openCatDrillSheet(actEl.dataset.id); break;
    case 'exportCSV': {
      const R = reportData();
      saveFile(`finkontrol_ops_${R.from}_${R.to}.csv`, txCSV(R.list), 'text/csv;charset=utf-8');
      break;
    }
    case 'exportCatCSV': {
      const R = reportData();
      const rows = [['Категория', 'Сумма', 'Доля %']];
      R.cats.forEach(x => rows.push([x.c.name, csvNum(x.v), csvNum(x.v / (R.exp || 1) * 100)]));
      saveFile(`finkontrol_categories_${R.from}_${R.to}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
      break;
    }
    case 'exportAll':
      saveFile(`finkontrol_all_${todayStr()}.csv`, txCSV(S.transactions), 'text/csv;charset=utf-8');
      break;
    case 'printReport': printCurrentReport(); break;
    case 'backup': doBackup(); break;
    case 'importData': $('#importFile').click(); break;
    case 'setPin': {
      const p = prompt('Введите 4 цифры для PIN-кода:');
      if (p && /^\d{4}$/.test(p.trim())) {
        S.settings.pin = hashPin(p.trim());
        save(); render(); toast('PIN-код установлен');
      } else if (p !== null) toast('Нужно ровно 4 цифры');
      break;
    }
    case 'removePin':
      S.settings.pin = ''; save(); render(); toast('PIN-код отключён');
      break;
    case 'reset':
      if (confirm('Вы уверены? Все операции, долги и настройки на этом устройстве будут удалены безвозвратно.')) {
        localStorage.removeItem(KEY);
        S = defaultState();
        S.settings.onboarded = true;
        save(); render(); toast('Все данные сброшены');
      }
      break;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'extraInp') {
    nav.extra = Math.max(0, r2(calc(t.value)));
    render();
  } else if (t.dataset.budget) {
    const v = r2(calc(t.value));
    if (v > 0) S.budgets[t.dataset.budget] = v;
    else delete S.budgets[t.dataset.budget];
    save(); render();
  } else if (t.dataset.set) {
    const k = t.dataset.set;
    S.settings[k] = k === 'smallLimit' ? Math.max(0, r2(calc(t.value))) : t.value;
    save(); render();
  } else if (t.dataset.rdate) {
    nav[t.dataset.rdate] = t.value;
    render();
  }
});

$('#importFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts)) {
        throw new Error('Неверный формат файла');
      }
      S = migrate(data);
      S.settings.onboarded = true;
      save(); render();
      toast('Данные успешно восстановлены!');
    } catch (err) {
      alert('Ошибка чтения файла: ' + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// Скрытие стартовой подсказки, если нажали «Скрыть»
const origStartCard = startCard;
window.startCard = function () {
  if (S.settings.startDismissed) return '';
  return origStartCard();
};

/* ---------- Инициализация ---------- */
render();
showLockScreen();
checkOnboarding();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

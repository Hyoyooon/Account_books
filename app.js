/**
 * app.js - Sweet Ledger Pro 메인 컨트롤러
 * 1) 고정 항목 금액 수정 시 과거 월 금액 보존 & 수정 월 이후부터 새 금액 적용 (이력 분할)
 * 2) 월별 고정 비용 관리의 불필요한 입력 열 제거
 * 3) 고정 비용 <-> 남편/아내 가계부 드래그 앤 드롭(끌어다 놓기) 및 [⬆️ 일반전환(이월중단)] 시 위쪽 가계부로 복원
 * 4) 자산 현황(금융·실물)에서도 가계부와 동일한 시작~종료 년/월(기본: 해당 월 ~ 계속) 지정 팝업 지원
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = {
    currentYear: 2026,
    currentMonth: 5,
    currentView: 'overview',
    // 자산 현황 등록 폼의 기본 시작/종료 년월 상태
    finFormStartYm: '2026-05',
    finFormEndYm: null,
    realFormStartYm: '2026-05',
    realFormEndYm: null
  };

  const VIEW_TITLES = {
    overview: '전체 현황',
    ledger: '가계부 작성',
    stocks: '주식 현황',
    assets: '자산 현황'
  };

  function fmtWon(val) {
    return Number(val || 0).toLocaleString('ko-KR') + '원';
  }

  function fmtNum(val) {
    return Number(val || 0).toLocaleString('ko-KR');
  }

  function fmtDeltaBadge(el, rate, inverseColor = false) {
    if (!el) return;
    const num = Number(rate || 0);
    const arrow = num > 0 ? '↑' : num < 0 ? '↓' : '—';
    const sign = num > 0 ? '+' : '';
    el.textContent = `${sign}${num}% ${arrow}`;

    el.classList.remove('up', 'down', 'neutral');
    if (num === 0) {
      el.classList.add('neutral');
    } else if (inverseColor) {
      el.classList.add(num > 0 ? 'down' : 'up');
    } else {
      el.classList.add(num > 0 ? 'up' : 'down');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function parseMoneyInput(val) {
    return Number(String(val || '').replace(/[^0-9.-]/g, '')) || 0;
  }

  function bindMoneyFormatting(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener('input', e => {
      const raw = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    });
  }

  function showToast(msg) {
    const t = document.getElementById('toastMsg');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ===================================================
  // 초기 셀렉트 박스 및 카테고리 세팅
  // ===================================================
  function initSelectors() {
    const yearSelects = [
      document.getElementById('selectYear'),
      document.getElementById('ledgerSelectYear'),
      document.getElementById('stockSelectYear'),
      document.getElementById('assetSelectYear'),
      document.getElementById('fixModalStartYear'),
      document.getElementById('fixModalEndYear')
    ];
    const monthSelects = [
      document.getElementById('selectMonth'),
      document.getElementById('ledgerSelectMonth'),
      document.getElementById('stockSelectMonth'),
      document.getElementById('assetSelectMonth'),
      document.getElementById('fixModalStartMonth'),
      document.getElementById('fixModalEndMonth')
    ];

    yearSelects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '';
      for (let y = 2024; y <= 2030; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `${y}년`;
        if (y === state.currentYear) opt.selected = true;
        sel.appendChild(opt);
      }
    });

    monthSelects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '';
      for (let m = 1; m <= 12; m++) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `${m}월`;
        if (m === state.currentMonth) opt.selected = true;
        sel.appendChild(opt);
      }
    });

    updatePersonCategoryOptions('husband');
    updatePersonCategoryOptions('wife');
  }

  function syncDateSelects() {
    ['selectYear', 'ledgerSelectYear', 'stockSelectYear', 'assetSelectYear'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = state.currentYear;
    });
    ['selectMonth', 'ledgerSelectMonth', 'stockSelectMonth', 'assetSelectMonth'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = state.currentMonth;
    });

    const currYm = toYearMonth(state.currentYear, state.currentMonth);
    state.finFormStartYm = currYm;
    state.finFormEndYm = null;
    state.realFormStartYm = currYm;
    state.realFormEndYm = null;
    updateAssetFormPeriodButtons();

    const sidePeriod = document.getElementById('sidebarPeriodText');
    if (sidePeriod) {
      sidePeriod.textContent = `${state.currentYear}.${String(state.currentMonth).padStart(2, '0')}`;
    }
    const topSub = document.getElementById('topPageSubtitle');
    if (topSub) {
      topSub.textContent = `${state.currentYear}년 ${state.currentMonth}월 기준 리포트`;
    }
  }

  function updateAssetFormPeriodButtons() {
    const finBtnTxt = document.getElementById('finPeriodBtnText');
    if (finBtnTxt) {
      finBtnTxt.textContent = formatPeriodDisplay(state.finFormStartYm, state.finFormEndYm);
    }
    const realBtnTxt = document.getElementById('realPeriodBtnText');
    if (realBtnTxt) {
      realBtnTxt.textContent = formatPeriodDisplay(state.realFormStartYm, state.realFormEndYm);
    }
  }

  function updatePersonCategoryOptions(who) {
    const typeEl = document.getElementById(`${who}Type`);
    const catEl = document.getElementById(`${who}Category`);
    if (!typeEl || !catEl) return;

    const list = CATEGORIES[typeEl.value] || [];
    catEl.innerHTML = '';
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catEl.appendChild(opt);
    });
  }

  // ===================================================
  // 사이드바 스냅샷 업데이트
  // ===================================================
  function renderSidebarSnapshot() {
    const ledger = Storage.getMonthLedgerSummary(state.currentYear, state.currentMonth);
    const stock = Storage.getStockMonthSummary(state.currentYear, state.currentMonth);
    const assets = Storage.getAssetsSummary(state.currentMonth, state.currentYear);

    const elH = document.getElementById('sideHusbandExp');
    const elW = document.getElementById('sideWifeExp');
    const elS = document.getElementById('sideStockTotal');
    const elA = document.getElementById('sideAssetTotal');

    if (elH) elH.textContent = fmtWon(ledger.husbandExpense);
    if (elW) elW.textContent = fmtWon(ledger.wifeExpense);
    if (elS) elS.textContent = fmtWon(stock.currTotal);
    if (elA) elA.textContent = fmtWon(assets.combinedAssetsTotal);
  }

  // ===================================================
  // [뷰 1] 전체 현황 렌더링
  // ===================================================
  function renderOverview() {
    const mom = Storage.getLedgerMoM(state.currentYear, state.currentMonth);
    const curr = mom.curr;

    document.getElementById('ovTotalIncome').textContent = fmtWon(curr.totalIncome);
    document.getElementById('ovHusbandIncome').textContent = fmtWon(curr.husbandIncome);
    document.getElementById('ovWifeIncome').textContent = fmtWon(curr.wifeIncome);
    fmtDeltaBadge(document.getElementById('ovIncomeDelta'), mom.incomeRate, false);

    document.getElementById('ovTotalExpense').textContent = fmtWon(curr.totalExpense);
    document.getElementById('ovHusbandExpense').textContent = fmtWon(curr.husbandExpense);
    document.getElementById('ovWifeExpense').textContent = fmtWon(curr.wifeExpense);
    fmtDeltaBadge(document.getElementById('ovExpenseDelta'), mom.expenseRate, true);

    document.getElementById('ovNetBalance').textContent = fmtWon(curr.netBalance);
    document.getElementById('ovMonthlySavings').textContent = fmtWon(curr.monthlySavings);
    document.getElementById('ovFixedTotal').textContent = fmtWon(curr.afterSavingsBalance);
    const fixedLabelEl = document.getElementById('ovFixedTotal').previousElementSibling;
    if (fixedLabelEl) fixedLabelEl.textContent = '✨ 저축 차감 후 잉여금';

    fmtDeltaBadge(document.getElementById('ovBalanceDelta'), mom.balanceRate, false);

    const nwData = Storage.getAnnualTotalNetWorth(state.currentYear, state.currentMonth);
    const currNW = nwData.currentItem;

    document.getElementById('ovTotalNetWorth').textContent = fmtWon(currNW.totalNetWorth);
    fmtDeltaBadge(document.getElementById('ovNetWorthDelta'), currNW.momRate, false);
    fmtDeltaBadge(document.getElementById('ovGrowth3m'), nwData.growth3m, false);
    fmtDeltaBadge(document.getElementById('ovGrowth6m'), nwData.growth6m, false);
    fmtDeltaBadge(document.getElementById('ovGrowth1y'), nwData.growth1y, false);

    const pillContainer = document.getElementById('netWorthPillBars');
    pillContainer.innerHTML = '';

    const values = nwData.monthlyItems.map(i => i.totalNetWorth);
    const minVal = Math.min(...values) * 0.94;
    const maxVal = Math.max(...values, 1);

    nwData.monthlyItems.forEach(item => {
      const col = document.createElement('div');
      col.className = 'pill-bar-col' + (item.month === state.currentMonth ? ' active' : '');

      const ratio = maxVal > minVal
        ? ((item.totalNetWorth - minVal) / (maxVal - minVal))
        : 0.5;
      const heightPct = Math.max(18, Math.round(20 + ratio * 80));

      const sign = item.momRate > 0 ? '+' : '';
      const rateColor = item.momRate >= 0 ? 'var(--up-green)' : 'var(--down-red)';

      col.innerHTML = `
        <div class="pill-bar-tooltip">
          <div style="font-weight:800; color:#ff9f43; margin-bottom:3px;">${state.currentYear}년 ${item.month}월 자산 누적</div>
          <div>총 자산: <b>${fmtWon(item.totalNetWorth)}</b> (${sign}${item.momRate}%)</div>
          <div style="color:#a1a1aa; font-size:0.7rem; margin-top:3px;">
            • 예금 자산: ${fmtWon(item.financialTotal)}<br>
            • 적금·청약 누적: ${fmtWon(item.ledgerCumulativeSavings)}<br>
            • 주식·실물: ${fmtWon(item.stockTotal + item.realTotal)}
          </div>
        </div>
        <div class="pill-bar-visual" style="height: ${heightPct}%;"></div>
        <div class="pill-bar-month">${item.labelEng}</div>
        <div class="pill-bar-rate" style="color:${rateColor};">${sign}${item.momRate}%</div>
      `;

      col.addEventListener('click', () => {
        state.currentMonth = item.month;
        syncDateSelects();
        renderAll();
      });

      pillContainer.appendChild(col);
    });

    document.getElementById('ovBreakdownTotal').textContent = fmtWon(currNW.totalNetWorth);
    const breakdownContainer = document.getElementById('assetBreakdownBars');
    const totalNW = Math.max(currNW.totalNetWorth, 1);

    const breakdownItems = [
      { name: '예금 자산', val: currNW.financialTotal, color: 'linear-gradient(90deg, #38bdf8, #2563eb)' },
      { name: '적금·청약 누적', val: currNW.ledgerCumulativeSavings, color: 'linear-gradient(90deg, #34d399, #059669)' },
      { name: '실물 자산', val: currNW.realTotal, color: 'linear-gradient(90deg, #ff9f43, #ff6b00)' },
      { name: '주식 평가액', val: currNW.stockTotal, color: 'linear-gradient(90deg, #a78bfa, #7c3aed)' }
    ];

    breakdownContainer.innerHTML = breakdownItems.map(b => {
      const pct = b.val > 0 ? Math.min(100, Math.max(5, Math.round((b.val / totalNW) * 100))) : 0;
      return `
        <div class="status-bar-item">
          <span class="status-bar-name">${b.name}</span>
          <div class="status-bar-track">
            <div class="status-bar-fill" style="width:${pct}%; background:${b.color};"></div>
          </div>
          <span class="status-bar-val">${Math.round(b.val / 10000).toLocaleString()}만</span>
        </div>
      `;
    }).join('');

    ChartManager.initGlobalDefaults();
    ChartManager.renderRatioChart(curr.totalIncome, curr.totalExpense, curr.monthlySavings);
    ChartManager.renderIncomeCategoryChart(curr.combinedTransactions);
    ChartManager.renderExpenseCategoryChart(curr.combinedTransactions);
  }

  // ===================================================
  // [뷰 2] 가계부 작성 렌더링 & 드래그 앤 드롭 & 이력 분할 수정
  // ===================================================
  let draggedItemInfo = null;

  function renderLedger() {
    const summary = Storage.getMonthLedgerSummary(state.currentYear, state.currentMonth);

    document.getElementById('ledgerTopIncome').textContent = fmtWon(summary.totalIncome);
    document.getElementById('ledgerTopExpense').textContent = fmtWon(summary.totalExpense);
    document.getElementById('ledgerTopBalance').textContent = fmtWon(summary.netBalance);

    document.getElementById('husbandPanelInc').textContent = fmtWon(summary.husbandIncome);
    document.getElementById('husbandPanelExp').textContent = fmtWon(summary.husbandExpense);
    document.getElementById('wifePanelInc').textContent = fmtWon(summary.wifeIncome);
    document.getElementById('wifePanelExp').textContent = fmtWon(summary.wifeExpense);

    renderPersonTxTable('남편', 'husbandTxBody', summary);
    renderPersonTxTable('아내', 'wifeTxBody', summary);
    renderFixedExpensesTable(summary);
  }

  function renderPersonTxTable(personName, tbodyId, summary) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const list = summary.combinedTransactions.filter(t => t.person === personName);
    tbody.innerHTML = '';

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:28px;">등록된 내역이 없습니다. (아래 고정 비용을 이곳으로 끌어다 놓으면 일반 내역으로 전환됩니다)</td></tr>`;
      return;
    }

    list.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'editable-row';
      tr.draggable = true;
      tr.title = '더블클릭하여 수정 / 드래그하여 고정비용 전환';
      const isInc = item.type === 'income';
      const isCarry = Boolean(item.isFixedCarry);

      const badgeClass = isCarry
        ? 'carry'
        : isInc
          ? 'income'
          : 'expense';
      const badgeLabel = isCarry
        ? (isInc ? '📌 고정수입' : '📌 고정이월')
        : (isInc ? '수입' : '지출');

      tr.innerHTML = `
        <td style="white-space:nowrap;">
          <span class="drag-handle" title="끌어서 이동">⠿</span>
          <span class="tag-badge ${badgeClass}">
            ${badgeLabel}
          </span>
        </td>
        <td style="font-weight:700; white-space:nowrap;">${escapeHtml(item.category)}</td>
        <td style="color:var(--text-secondary); word-break:keep-all;">${escapeHtml(item.memo || '-')}</td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:700; white-space:nowrap; color:${isInc ? 'var(--up-green)' : 'var(--down-red)'};">
          ${isInc ? '+' : '-'}${fmtWon(item.amount)}
        </td>
        <td style="text-align:center; white-space:nowrap;">
          ${isCarry
            ? `<button type="button" class="btn-icon-del" data-revert-carry="${item.id}" title="고정 해제 후 일반 내역으로 전환">일반전환</button>`
            : `<button type="button" class="btn-icon-del" data-del-tx="${item.id}" title="삭제">✕</button>`}
        </td>
      `;

      // 드래그 시작 이벤트
      tr.addEventListener('dragstart', e => {
        draggedItemInfo = {
          source: isCarry ? 'fixed' : 'normal',
          item
        };
        e.dataTransfer.effectAllowed = 'move';
      });

      const revertBtn = tr.querySelector('[data-revert-carry]');
      if (revertBtn) {
        revertBtn.addEventListener('click', e => {
          e.stopPropagation();
          Storage.revertFixedToNormalTx(item.id, state.currentYear, state.currentMonth, item.person);
          renderAll();
          showToast('⬆️ 고정 이월이 해제되어 일반 가계부 내역으로 전환되었습니다.');
        });
      }

      tr.addEventListener('dblclick', () => {
        enableTxInlineEdit(tr, item);
      });

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-del-tx]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-del-tx');
        Storage.deleteTransaction(id);
        renderAll();
        showToast('🗑️ 내역이 삭제되었습니다.');
      });
    });
  }

  function enableTxInlineEdit(tr, item) {
    if (tr.classList.contains('editing-row')) return;
    tr.classList.add('editing-row');
    tr.draggable = false;

    const isCarry = Boolean(item.isFixedCarry);
    const currentType = item.type || 'expense';
    const catList = CATEGORIES[currentType] || CATEGORIES.expense;
    const catOptions = catList.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('');
    const memoVal = isCarry ? (item.rawTitle || '') : (item.memo || '');

    tr.innerHTML = `
      <td>
        ${isCarry
          ? '<span class="tag-badge carry">📌 고정이월</span>'
          : `<select class="inline-select edit-tx-type">
              <option value="income" ${currentType === 'income' ? 'selected' : ''}>수입</option>
              <option value="expense" ${currentType === 'expense' ? 'selected' : ''}>지출</option>
             </select>`}
      </td>
      <td>
        <select class="inline-select edit-tx-cat">${catOptions}</select>
      </td>
      <td>
        <input type="text" class="inline-input edit-tx-memo" value="${escapeHtml(memoVal)}">
      </td>
      <td>
        <input type="text" class="inline-input edit-tx-amt" style="text-align:right;" value="${fmtNum(item.amount)}">
      </td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn-inline-save">저장</button>
        <button type="button" class="btn-inline-cancel">취소</button>
      </td>
    `;

    const typeSel = tr.querySelector('.edit-tx-type');
    const catSel = tr.querySelector('.edit-tx-cat');
    const memoInp = tr.querySelector('.edit-tx-memo');
    const amtInp = tr.querySelector('.edit-tx-amt');

    bindMoneyFormatting(amtInp);

    if (typeSel) {
      typeSel.addEventListener('change', () => {
        const list = CATEGORIES[typeSel.value] || [];
        catSel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
      });
    }

    const saveChanges = () => {
      const newAmt = parseMoneyInput(amtInp.value);
      if (newAmt <= 0) return;
      if (isCarry) {
        const res = Storage.updateFixedExpense(item.id, {
          category: catSel.value,
          title: memoInp.value.trim(),
          amount: newAmt
        }, state.currentYear, state.currentMonth);

        renderAll();
        if (res === 'split') {
          showToast(`📌 ${state.currentMonth - 1}월까지는 기존 금액이 보존되고, ${state.currentMonth}월부터 새 금액이 적용되었습니다!`);
        } else {
          showToast('✏️ 고정 내역이 수정되었습니다.');
        }
      } else {
        Storage.updateTransaction(item.id, {
          type: typeSel ? typeSel.value : item.type,
          category: catSel.value,
          memo: memoInp.value.trim(),
          amount: newAmt
        });
        renderAll();
        showToast('✏️ 내역이 수정되었습니다.');
      }
    };

    tr.querySelector('.btn-inline-save').addEventListener('click', e => {
      e.stopPropagation();
      saveChanges();
    });
    tr.querySelector('.btn-inline-cancel').addEventListener('click', e => {
      e.stopPropagation();
      renderAll();
    });

    [memoInp, amtInp].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveChanges();
        } else if (e.key === 'Escape') {
          renderAll();
        }
      });
    });

    amtInp.focus();
  }

  function renderFixedExpensesTable(summary) {
    const tbody = document.getElementById('fixedExpenseBody');
    const badge = document.getElementById('fixedTotalBadge');
    if (badge) badge.textContent = `고정지출 합계: ${fmtWon(summary.totalFixed)}`;
    if (!tbody) return;

    const list = summary.fixedList;
    tbody.innerHTML = '';

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">해당 월에 적용 중인 고정 항목이 없습니다. 위쪽 가계부에서 '수입·지출' 배지를 클릭하거나 이곳으로 끌어다 놓으세요.</td></tr>`;
      return;
    }

    list.forEach(f => {
      const tr = document.createElement('tr');
      tr.className = 'editable-row';
      tr.draggable = true;
      tr.title = '더블클릭하여 수정 / 위쪽 남편·아내 가계부로 끌어다 놓으면 일반 내역으로 복귀';
      const isH = f.person === '남편';
      const isInc = f.type === 'income';
      const startDisp = (f.startYearMonth || '2026-01').replace('-', '.');
      const endDisp = f.endYearMonth ? f.endYearMonth.replace('-', '.') : '계속';
      tr.innerHTML = `
        <td>
          <span class="drag-handle" title="위쪽 가계부로 끌어서 일반 내역 전환">⠿</span>
          <span class="tag-badge ${isH ? 'husband' : 'wife'}">${isH ? '🙋‍♂️ 남편' : '🙋‍♀️ 아내'}</span>
        </td>
        <td><span class="tag-badge ${isInc ? 'income' : 'expense'}">${isInc ? '➕ 고정수입' : '➖ 고정지출'}</span></td>
        <td style="font-weight:700;">${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.title)}</td>
        <td style="font-family:var(--font-mono); color:var(--text-secondary);">
          <span class="clickable-expense-badge" data-edit-period="${f.id}" style="padding:2px 8px; border-radius:6px;" title="클릭하여 시작/종료 기간 변경">
            ${startDisp} ~ ${endDisp} ▾
          </span>
        </td>
        <td><span class="tag-badge carry">🔄 자동 이월중</span></td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:${isInc ? 'var(--up-green)' : 'var(--accent-orange-light)'};">
          ${isInc ? '+' : '-'}${fmtWon(f.amount)}
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn-icon-del" data-stop-fix="${f.id}" title="고정 이월을 중단하고 위쪽 일반 가계부 내역으로 올립니다">⬆️ 일반전환</button>
        </td>
      `;

      // 드래그 시작 (아래 -> 위 드래그 시 일반 내역 복귀용)
      tr.addEventListener('dragstart', e => {
        draggedItemInfo = {
          source: 'fixed',
          item: { ...f, isFixedCarry: true, rawTitle: f.title }
        };
        e.dataTransfer.effectAllowed = 'move';
      });

      const periodBadge = tr.querySelector('[data-edit-period]');
      if (periodBadge) {
        periodBadge.addEventListener('click', e => {
          e.stopPropagation();
          openPeriodModal({
            mode: 'ledger_fixed',
            item: { ...f, isFixedCarry: true, rawTitle: f.title }
          });
        });
      }

      tr.addEventListener('dblclick', () => {
        enableFixedInlineEdit(tr, f);
      });

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-stop-fix]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-stop-fix');
        Storage.revertFixedToNormalTx(id, state.currentYear, state.currentMonth);
        renderAll();
        showToast('⬆️ 고정 이월이 해제되어 위쪽 남편/아내 가계부 일반 내역으로 올라갔습니다!');
      });
    });
  }

  function enableFixedInlineEdit(tr, f) {
    if (tr.classList.contains('editing-row')) return;
    tr.classList.add('editing-row');
    tr.draggable = false;

    const fixType = f.type || 'expense';
    const catList = CATEGORIES[fixType] || CATEGORIES.expense;
    const catOptions = catList.map(c => `<option value="${c}" ${c === f.category ? 'selected' : ''}>${c}</option>`).join('');

    tr.innerHTML = `
      <td>
        <select class="inline-select edit-fix-person">
          <option value="남편" ${f.person === '남편' ? 'selected' : ''}>남편</option>
          <option value="아내" ${f.person === '아내' ? 'selected' : ''}>아내</option>
        </select>
      </td>
      <td>
        <select class="inline-select edit-fix-type">
          <option value="income" ${fixType === 'income' ? 'selected' : ''}>수입</option>
          <option value="expense" ${fixType === 'expense' ? 'selected' : ''}>지출</option>
        </select>
      </td>
      <td>
        <select class="inline-select edit-fix-cat">${catOptions}</select>
      </td>
      <td>
        <input type="text" class="inline-input edit-fix-title" value="${escapeHtml(f.title)}">
      </td>
      <td style="font-family:var(--font-mono); color:var(--text-muted);">${(f.startYearMonth || '2026-01').replace('-', '.')} ~ ${f.endYearMonth ? f.endYearMonth.replace('-', '.') : '계속'}</td>
      <td><span class="tag-badge carry">수정중</span></td>
      <td>
        <input type="text" class="inline-input edit-fix-amt" style="text-align:right;" value="${fmtNum(f.amount)}">
      </td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn-inline-save">저장</button>
        <button type="button" class="btn-inline-cancel">취소</button>
      </td>
    `;

    const personSel = tr.querySelector('.edit-fix-person');
    const typeSel = tr.querySelector('.edit-fix-type');
    const catSel = tr.querySelector('.edit-fix-cat');
    const titleInp = tr.querySelector('.edit-fix-title');
    const amtInp = tr.querySelector('.edit-fix-amt');
    bindMoneyFormatting(amtInp);

    typeSel.addEventListener('change', () => {
      const newList = CATEGORIES[typeSel.value] || [];
      catSel.innerHTML = newList.map(c => `<option value="${c}">${c}</option>`).join('');
    });

    const saveFix = () => {
      const newAmt = parseMoneyInput(amtInp.value);
      if (newAmt <= 0) return;
      const res = Storage.updateFixedExpense(f.id, {
        person: personSel.value,
        type: typeSel.value,
        category: catSel.value,
        title: titleInp.value.trim(),
        amount: newAmt
      }, state.currentYear, state.currentMonth);

      renderAll();
      if (res === 'split') {
        showToast(`📌 ${state.currentMonth - 1}월까지는 기존 금액이 보존되고, ${state.currentMonth}월부터 새 금액(${fmtWon(newAmt)})으로 적용되었습니다!`);
      } else {
        showToast('✏️ 고정 항목이 수정되었습니다.');
      }
    };

    tr.querySelector('.btn-inline-save').addEventListener('click', e => {
      e.stopPropagation();
      saveFix();
    });
    tr.querySelector('.btn-inline-cancel').addEventListener('click', e => {
      e.stopPropagation();
      renderAll();
    });

    [titleInp, amtInp].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveFix();
        } else if (e.key === 'Escape') {
          renderAll();
        }
      });
    });

    amtInp.focus();
  }

  // 드래그 앤 드롭 영역 바인딩 (남편 패널, 아내 패널, 하단 고정비용 패널)
  function initDragAndDropZones() {
    const husbandZone = document.getElementById('dropZoneHusband');
    const wifeZone = document.getElementById('dropZoneWife');
    const fixedZone = document.getElementById('dropZoneFixed');

    [husbandZone, wifeZone].forEach(zone => {
      if (!zone) return;
      zone.addEventListener('dragover', e => {
        if (draggedItemInfo && draggedItemInfo.source === 'fixed') {
          e.preventDefault();
          zone.classList.add('drag-over');
        }
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        zone.classList.remove('drag-over');
        if (draggedItemInfo && draggedItemInfo.source === 'fixed') {
          e.preventDefault();
          const targetPerson = zone.dataset.dropPerson || draggedItemInfo.item.person;
          Storage.revertFixedToNormalTx(draggedItemInfo.item.id, state.currentYear, state.currentMonth, targetPerson);
          draggedItemInfo = null;
          renderAll();
          showToast(`⬆️ 고정 항목이 [${targetPerson}] 일반 가계부 내역으로 이동되었습니다!`);
        }
      });
    });

    if (fixedZone) {
      fixedZone.addEventListener('dragover', e => {
        if (draggedItemInfo && draggedItemInfo.source === 'normal') {
          e.preventDefault();
          fixedZone.classList.add('drag-over');
        }
      });
      fixedZone.addEventListener('dragleave', () => fixedZone.classList.remove('drag-over'));
      fixedZone.addEventListener('drop', e => {
        fixedZone.classList.remove('drag-over');
        if (draggedItemInfo && draggedItemInfo.source === 'normal') {
          e.preventDefault();
          const item = draggedItemInfo.item;
          draggedItemInfo = null;
          openPeriodModal({
            mode: 'ledger_fixed',
            item
          });
        }
      });
    }
  }

  // ===================================================
  // [뷰 3] 주식 현황 렌더링 & 더블클릭 인라인 수정
  // ===================================================
  function renderStocks() {
    const summary = Storage.getStockMonthSummary(state.currentYear, state.currentMonth);
    const lastDate = getLastDayOfMonth(state.currentYear, state.currentMonth);

    const stkTopH = document.getElementById('stkTopHusband');
    const stkTopW = document.getElementById('stkTopWife');
    const stkTopT = document.getElementById('stkTopTotal');
    if (stkTopH) stkTopH.textContent = fmtWon(summary.husbandTotal);
    if (stkTopW) stkTopW.textContent = fmtWon(summary.wifeTotal);
    if (stkTopT) stkTopT.textContent = fmtWon(summary.currTotal);

    document.getElementById('stkTotalValue').textContent = fmtWon(summary.currTotal);
    document.getElementById('stkHusbandTotal').textContent = fmtWon(summary.husbandTotal);
    document.getElementById('stkWifeTotal').textContent = fmtWon(summary.wifeTotal);
    document.getElementById('stkLastDayLabel').textContent = `기준일: ${lastDate} (월말 기준)`;
    document.getElementById('stkChartYear').textContent = state.currentYear;
    document.getElementById('stkFormMonthTitle').textContent = `${state.currentYear}년 ${state.currentMonth}월 말 (${lastDate})`;
    const stkInputDateCell = document.getElementById('stkInputDateCell');
    if (stkInputDateCell) stkInputDateCell.textContent = lastDate;

    fmtDeltaBadge(document.getElementById('stkMomDelta'), summary.diffRate, false);

    ChartManager.initGlobalDefaults();
    ChartManager.renderStockLineChart(state.currentYear);

    const tbody = document.getElementById('stockTableBody');
    tbody.innerHTML = '';

    if (summary.list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:28px;">등록된 주식 현황이 없습니다. 상단 입력란에서 매월 말일 기준 주식 보유량과 평가금액을 등록해 보세요.</td></tr>`;
      return;
    }

    summary.list.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'editable-row';
      tr.title = '더블클릭하여 주식 현황 수정';
      const isH = item.person === '남편';
      let rateHtml = '<span style="color:var(--text-muted);">신규 종목</span>';
      if (item.diffRate !== null) {
        const sign = item.diffRate > 0 ? '+' : '';
        const arrow = item.diffRate > 0 ? '↑' : item.diffRate < 0 ? '↓' : '—';
        const cls = item.diffRate >= 0 ? 'up' : 'down';
        rateHtml = `<span class="delta-badge ${cls}">${sign}${item.diffRate}% ${arrow}</span>`;
      }

      tr.innerHTML = `
        <td style="font-family:var(--font-mono); color:var(--text-muted);">${item.date}</td>
        <td><span class="tag-badge ${isH ? 'husband' : 'wife'}">${isH ? '🙋‍♂️ 남편' : '🙋‍♀️ 아내'}</span></td>
        <td style="font-weight:700;">${escapeHtml(item.name)}</td>
        <td style="text-align:right; font-family:var(--font-mono);">${Number(item.quantity).toLocaleString()}주</td>
        <td style="text-align:right; font-family:var(--font-mono); color:var(--text-muted);">${item.prevValue > 0 ? fmtWon(item.prevValue) : '-'}</td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:700;">${fmtWon(item.totalValue)}</td>
        <td style="text-align:right; font-family:var(--font-mono);">${rateHtml}</td>
        <td style="color:var(--text-secondary);">${escapeHtml(item.memo || '-')}</td>
        <td style="text-align:center;">
          <button type="button" class="btn-icon-del" data-del-stk="${item.id}">✕</button>
        </td>
      `;

      tr.addEventListener('dblclick', () => {
        enableStockInlineEdit(tr, item);
      });

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-del-stk]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-del-stk');
        Storage.deleteStock(id);
        renderAll();
        showToast('🗑️ 주식 내역이 삭제되었습니다.');
      });
    });
  }

  function enableStockInlineEdit(tr, item) {
    if (tr.classList.contains('editing-row')) return;
    tr.classList.add('editing-row');

    tr.innerHTML = `
      <td style="font-family:var(--font-mono); color:var(--text-muted);">${item.date}</td>
      <td>
        <select class="inline-select edit-stk-person">
          <option value="남편" ${item.person === '남편' ? 'selected' : ''}>남편</option>
          <option value="아내" ${item.person === '아내' ? 'selected' : ''}>아내</option>
        </select>
      </td>
      <td>
        <input type="text" class="inline-input edit-stk-name" value="${escapeHtml(item.name)}">
      </td>
      <td>
        <input type="text" class="inline-input edit-stk-qty" style="text-align:right;" value="${fmtNum(item.quantity)}">
      </td>
      <td style="text-align:right; font-family:var(--font-mono); color:var(--text-muted);">${item.prevValue > 0 ? fmtWon(item.prevValue) : '-'}</td>
      <td>
        <input type="text" class="inline-input edit-stk-val" style="text-align:right;" value="${fmtNum(item.totalValue)}">
      </td>
      <td style="text-align:right; color:var(--text-muted); font-size:0.75rem;">자동계산</td>
      <td>
        <input type="text" class="inline-input edit-stk-memo" value="${escapeHtml(item.memo || '')}">
      </td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn-inline-save">저장</button>
        <button type="button" class="btn-inline-cancel">취소</button>
      </td>
    `;

    const personSel = tr.querySelector('.edit-stk-person');
    const nameInp = tr.querySelector('.edit-stk-name');
    const qtyInp = tr.querySelector('.edit-stk-qty');
    const valInp = tr.querySelector('.edit-stk-val');
    const memoInp = tr.querySelector('.edit-stk-memo');

    bindMoneyFormatting(qtyInp);
    bindMoneyFormatting(valInp);

    const saveStk = () => {
      const newVal = parseMoneyInput(valInp.value);
      if (newVal <= 0) return;
      Storage.updateStock(item.id, {
        person: personSel.value,
        name: nameInp.value.trim(),
        quantity: parseMoneyInput(qtyInp.value),
        totalValue: newVal,
        memo: memoInp.value.trim()
      });
      renderAll();
      showToast('✏️ 주식 현황이 수정되었습니다.');
    };

    tr.querySelector('.btn-inline-save').addEventListener('click', e => {
      e.stopPropagation();
      saveStk();
    });
    tr.querySelector('.btn-inline-cancel').addEventListener('click', e => {
      e.stopPropagation();
      renderAll();
    });

    [nameInp, qtyInp, valInp, memoInp].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveStk();
        } else if (e.key === 'Escape') {
          renderAll();
        }
      });
    });

    valInp.focus();
  }

  // ===================================================
  // [뷰 4] 자산 현황 렌더링 (가계부와 동일한 시작~종료 년/월 지정 지원)
  // ===================================================
  function renderAssets() {
    const summary = Storage.getAssetsSummary(state.currentMonth, state.currentYear);

    const astTopF = document.getElementById('astTopFin');
    const astTopR = document.getElementById('astTopReal');
    const astTopC = document.getElementById('astTopCombined');
    if (astTopF) astTopF.textContent = fmtWon(summary.finTotalSum);
    if (astTopR) astTopR.textContent = fmtWon(summary.realTotalSum);
    if (astTopC) astTopC.textContent = fmtWon(summary.combinedAssetsTotal);

    document.getElementById('astCombinedTotal').textContent = fmtWon(summary.combinedAssetsTotal);
    document.getElementById('astFinTotal').textContent = fmtWon(summary.finTotalSum);
    document.getElementById('astFinSub').textContent = `월 정기 저축 납입액 합계: ${fmtWon(summary.finSavingsSum)}`;
    document.getElementById('astRealTotal').textContent = fmtWon(summary.realTotalSum);
    document.getElementById('astRealSub').textContent = `매입 금액 합계: ${fmtWon(summary.realPurchaseSum)}`;

    // 1. 금융 자산 표
    const finBody = document.getElementById('finAssetBody');
    finBody.innerHTML = '';
    if (summary.finList.length === 0) {
      finBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">등록된 금융 자산이 없습니다.</td></tr>`;
    } else {
      summary.finList.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'editable-row';
        tr.title = '더블클릭하여 금융 자산 수정 / 기간 클릭 시 시작·종료 년월 변경';
        const pBadge = item.person === '남편' ? 'husband' : item.person === '아내' ? 'wife' : 'joint';
        const dispTotal = item.displayTotalAmount !== undefined ? item.displayTotalAmount : item.totalAmount;
        const isInstallment = item.type === '적금' || item.type === '청약' || Number(item.savingsAmount) > 0;

        tr.innerHTML = `
          <td><span class="tag-badge ${pBadge}">${escapeHtml(item.person)}</span></td>
          <td><span class="tag-badge income">${escapeHtml(item.type)}</span></td>
          <td style="font-weight:700;">${escapeHtml(item.name)}</td>
          <td style="font-family:var(--font-mono); color:var(--text-secondary);">
            <span class="clickable-expense-badge" data-fin-period="${item.id}" style="padding:2px 8px; border-radius:6px;" title="클릭하여 시작 ~ 종료 년/월 지정">
              ${escapeHtml(item.period)} ▾
            </span>
          </td>
          <td style="text-align:right; font-family:var(--font-mono); color:var(--accent-orange-light);">${Number(item.rate).toFixed(2)}%</td>
          <td style="text-align:right; font-family:var(--font-mono);">
            ${Number(item.savingsAmount) > 0 ? `월 ${fmtWon(item.savingsAmount)}` : '-'}
          </td>
          <td style="text-align:right; font-family:var(--font-mono); font-weight:800; color:var(--up-green);">
            ${fmtWon(dispTotal)}
            ${isInstallment ? `<div style="font-size:0.68rem; color:var(--text-muted); font-weight:normal;">(${state.currentMonth}월 누적 기준)</div>` : ''}
          </td>
          <td style="text-align:center;">
            <button type="button" class="btn-icon-del" data-del-fin="${item.id}">✕</button>
          </td>
        `;

        const periodBadge = tr.querySelector('[data-fin-period]');
        if (periodBadge) {
          periodBadge.addEventListener('click', e => {
            e.stopPropagation();
            openPeriodModal({
              mode: 'fin_asset_row',
              item
            });
          });
        }

        tr.addEventListener('dblclick', () => {
          enableFinAssetInlineEdit(tr, item);
        });

        finBody.appendChild(tr);
      });
    }
    document.getElementById('finFootSavings').textContent = fmtWon(summary.finSavingsSum);
    document.getElementById('finFootTotal').textContent = fmtWon(summary.finTotalSum);

    finBody.querySelectorAll('[data-del-fin]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        Storage.deleteFinancialAsset(e.currentTarget.getAttribute('data-del-fin'));
        renderAll();
        showToast('🗑️ 금융 자산 항목이 삭제되었습니다.');
      });
    });

    // 2. 실물 자산 표
    const realBody = document.getElementById('realAssetBody');
    realBody.innerHTML = '';
    if (summary.realList.length === 0) {
      realBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">등록된 실물 자산이 없습니다. 상단 입력란에서 부동산·차량 등의 실물 자산을 추가해 보세요.</td></tr>`;
    } else {
      summary.realList.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'editable-row';
        tr.title = '더블클릭하여 실물 자산 수정 / 기간 클릭 시 시작·종료 년월 변경';
        const pBadge = item.person === '남편' ? 'husband' : item.person === '아내' ? 'wife' : 'joint';
        const rateNum = Number(item.rate) || 0;
        const rateCls = rateNum >= 0 ? 'up' : 'down';
        const rateSign = rateNum > 0 ? '+' : '';

        tr.innerHTML = `
          <td><span class="tag-badge ${pBadge}">${escapeHtml(item.person)}</span></td>
          <td><span class="tag-badge carry">${escapeHtml(item.type)}</span></td>
          <td style="font-weight:700;">${escapeHtml(item.name)}</td>
          <td style="font-family:var(--font-mono); color:var(--text-secondary);">
            <span class="clickable-expense-badge" data-real-period="${item.id}" style="padding:2px 8px; border-radius:6px;" title="클릭하여 시작 ~ 종료 년/월 지정">
              ${escapeHtml(item.period)} ▾
            </span>
          </td>
          <td style="text-align:right; font-family:var(--font-mono);"><span class="delta-badge ${rateCls}">${rateSign}${rateNum}%</span></td>
          <td style="text-align:right; font-family:var(--font-mono);">${fmtWon(item.purchaseAmount)}</td>
          <td style="text-align:right; font-family:var(--font-mono); font-weight:800; color:var(--accent-orange-light);">${fmtWon(item.totalAmount)}</td>
          <td style="text-align:center;">
            <button type="button" class="btn-icon-del" data-del-real="${item.id}">✕</button>
          </td>
        `;

        const periodBadge = tr.querySelector('[data-real-period]');
        if (periodBadge) {
          periodBadge.addEventListener('click', e => {
            e.stopPropagation();
            openPeriodModal({
              mode: 'real_asset_row',
              item
            });
          });
        }

        tr.addEventListener('dblclick', () => {
          enableRealAssetInlineEdit(tr, item);
        });

        realBody.appendChild(tr);
      });
    }
    document.getElementById('realFootPurchase').textContent = fmtWon(summary.realPurchaseSum);
    document.getElementById('realFootTotal').textContent = fmtWon(summary.realTotalSum);

    realBody.querySelectorAll('[data-del-real]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        Storage.deleteRealAsset(e.currentTarget.getAttribute('data-del-real'));
        renderAll();
        showToast('🗑️ 실물 자산 항목이 삭제되었습니다.');
      });
    });
  }

  function enableFinAssetInlineEdit(tr, item) {
    if (tr.classList.contains('editing-row')) return;
    tr.classList.add('editing-row');

    const dispTotal = item.displayTotalAmount !== undefined ? item.displayTotalAmount : item.totalAmount;

    tr.innerHTML = `
      <td>
        <select class="inline-select edit-fin-person">
          <option value="공동" ${item.person === '공동' ? 'selected' : ''}>공동</option>
          <option value="남편" ${item.person === '남편' ? 'selected' : ''}>남편</option>
          <option value="아내" ${item.person === '아내' ? 'selected' : ''}>아내</option>
        </select>
      </td>
      <td>
        <select class="inline-select edit-fin-type">
          <option value="적금" ${item.type === '적금' ? 'selected' : ''}>적금</option>
          <option value="예금" ${item.type === '예금' ? 'selected' : ''}>예금</option>
          <option value="청약" ${item.type === '청약' ? 'selected' : ''}>청약</option>
          <option value="CMA" ${item.type === 'CMA' ? 'selected' : ''}>CMA</option>
          <option value="기타" ${item.type === '기타' ? 'selected' : ''}>기타</option>
        </select>
      </td>
      <td>
        <input type="text" class="inline-input edit-fin-name" value="${escapeHtml(item.name)}">
      </td>
      <td style="font-family:var(--font-mono); color:var(--text-muted); font-size:0.78rem;">${escapeHtml(item.period)}</td>
      <td>
        <input type="number" step="0.01" class="inline-input edit-fin-rate" style="text-align:right;" value="${item.rate}">
      </td>
      <td>
        <input type="text" class="inline-input edit-fin-sav" style="text-align:right;" value="${fmtNum(item.savingsAmount)}" placeholder="월 저축액">
      </td>
      <td>
        <input type="text" class="inline-input edit-fin-tot" style="text-align:right;" value="${fmtNum(dispTotal)}">
      </td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn-inline-save">저장</button>
        <button type="button" class="btn-inline-cancel">취소</button>
      </td>
    `;

    const personSel = tr.querySelector('.edit-fin-person');
    const typeSel = tr.querySelector('.edit-fin-type');
    const nameInp = tr.querySelector('.edit-fin-name');
    const rateInp = tr.querySelector('.edit-fin-rate');
    const savInp = tr.querySelector('.edit-fin-sav');
    const totInp = tr.querySelector('.edit-fin-tot');

    bindMoneyFormatting(savInp);
    bindMoneyFormatting(totInp);

    let totalManuallyEdited = false;

    savInp.addEventListener('input', () => {
      if (typeSel.value === '적금' || typeSel.value === '청약') {
        const newSav = parseMoneyInput(savInp.value);
        const startYm = item.startYearMonth || '2026-01';
        const currYm = toYearMonth(state.currentYear, state.currentMonth);
        const monthsCount = Math.max(1, diffMonthsInclusive(startYm, currYm));
        const base = Number(item.baseBalance) || 0;
        const autoTotal = base + (newSav * monthsCount);
        totInp.value = fmtNum(autoTotal);
        totalManuallyEdited = false;
      }
    });

    totInp.addEventListener('input', () => {
      totalManuallyEdited = true;
    });

    const saveFin = () => {
      Storage.updateFinancialAsset(item.id, {
        person: personSel.value,
        type: typeSel.value,
        name: nameInp.value.trim(),
        rate: rateInp.value,
        savingsAmount: parseMoneyInput(savInp.value),
        totalAmount: parseMoneyInput(totInp.value),
        totalAmountChangedExplicitly: totalManuallyEdited
      }, state.currentMonth, state.currentYear);
      renderAll();
      showToast('✏️ 금융 자산이 수정되었습니다.');
    };

    tr.querySelector('.btn-inline-save').addEventListener('click', e => {
      e.stopPropagation();
      saveFin();
    });
    tr.querySelector('.btn-inline-cancel').addEventListener('click', e => {
      e.stopPropagation();
      renderAll();
    });

    [nameInp, rateInp, savInp, totInp].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveFin();
        } else if (e.key === 'Escape') {
          renderAll();
        }
      });
    });

    savInp.focus();
  }

  function enableRealAssetInlineEdit(tr, item) {
    if (tr.classList.contains('editing-row')) return;
    tr.classList.add('editing-row');

    tr.innerHTML = `
      <td>
        <select class="inline-select edit-real-person">
          <option value="공동" ${item.person === '공동' ? 'selected' : ''}>공동</option>
          <option value="남편" ${item.person === '남편' ? 'selected' : ''}>남편</option>
          <option value="아내" ${item.person === '아내' ? 'selected' : ''}>아내</option>
        </select>
      </td>
      <td>
        <select class="inline-select edit-real-type">
          <option value="부동산" ${item.type === '부동산' ? 'selected' : ''}>부동산</option>
          <option value="자동차" ${item.type === '자동차' ? 'selected' : ''}>자동차</option>
          <option value="귀금속/금" ${item.type === '귀금속/금' ? 'selected' : ''}>귀금속/금</option>
          <option value="기타" ${item.type === '기타' ? 'selected' : ''}>기타</option>
        </select>
      </td>
      <td>
        <input type="text" class="inline-input edit-real-name" value="${escapeHtml(item.name)}">
      </td>
      <td style="font-family:var(--font-mono); color:var(--text-muted); font-size:0.78rem;">${escapeHtml(item.period)}</td>
      <td>
        <input type="number" step="0.01" class="inline-input edit-real-rate" style="text-align:right;" value="${item.rate}">
      </td>
      <td>
        <input type="text" class="inline-input edit-real-pur" style="text-align:right;" value="${fmtNum(item.purchaseAmount)}">
      </td>
      <td>
        <input type="text" class="inline-input edit-real-tot" style="text-align:right;" value="${fmtNum(item.totalAmount)}">
      </td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn-inline-save">저장</button>
        <button type="button" class="btn-inline-cancel">취소</button>
      </td>
    `;

    const personSel = tr.querySelector('.edit-real-person');
    const typeSel = tr.querySelector('.edit-real-type');
    const nameInp = tr.querySelector('.edit-real-name');
    const rateInp = tr.querySelector('.edit-real-rate');
    const purInp = tr.querySelector('.edit-real-pur');
    const totInp = tr.querySelector('.edit-real-tot');

    bindMoneyFormatting(purInp);
    bindMoneyFormatting(totInp);

    const saveReal = () => {
      Storage.updateRealAsset(item.id, {
        person: personSel.value,
        type: typeSel.value,
        name: nameInp.value.trim(),
        rate: rateInp.value,
        purchaseAmount: parseMoneyInput(purInp.value),
        totalAmount: parseMoneyInput(totInp.value)
      });
      renderAll();
      showToast('✏️ 실물 자산이 수정되었습니다.');
    };

    tr.querySelector('.btn-inline-save').addEventListener('click', e => {
      e.stopPropagation();
      saveReal();
    });
    tr.querySelector('.btn-inline-cancel').addEventListener('click', e => {
      e.stopPropagation();
      renderAll();
    });

    [nameInp, rateInp, purInp, totInp].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveReal();
        } else if (e.key === 'Escape') {
          renderAll();
        }
      });
    });

    totInp.focus();
  }

  // ===================================================
  // 통합 렌더링 및 뷰 전환
  // ===================================================
  function switchView(viewName) {
    state.currentView = viewName;
    document.querySelectorAll('#sidebarNav .nav-item').forEach(li => {
      li.classList.toggle('active', li.dataset.view === viewName);
    });
    document.querySelectorAll('.view-page').forEach(sec => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });
    const titleEl = document.getElementById('topPageTitle');
    if (titleEl) titleEl.textContent = VIEW_TITLES[viewName] || '전체 현황';

    renderAll();
  }

  function renderAll() {
    syncDateSelects();
    renderSidebarSnapshot();
    renderOverview();
    renderLedger();
    renderStocks();
    renderAssets();
  }

  // ===================================================
  // 통합 엑셀 다운로드
  // ===================================================
  function exportIntegratedExcel() {
    if (!window.XLSX) {
      alert('엑셀 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const ledger = Storage.getMonthLedgerSummary(state.currentYear, state.currentMonth);
    const stock = Storage.getStockMonthSummary(state.currentYear, state.currentMonth);
    const assets = Storage.getAssetsSummary(state.currentMonth, state.currentYear);

    const txRows = [['기준년월', '작성자', '구분', '세부 카테고리', '금액(원)', '내용/메모']];
    ledger.combinedTransactions.forEach(t => {
      txRows.push([
        t.yearMonth,
        t.person,
        t.isFixedCarry ? '고정이월' : t.type === 'income' ? '수입' : '지출',
        t.category,
        Number(t.amount),
        t.memo || ''
      ]);
    });
    const wsTx = XLSX.utils.aoa_to_sheet(txRows);
    XLSX.utils.book_append_sheet(wb, wsTx, `${state.currentMonth}월_가계부내역`);

    const stkRows = [['기준일(월말)', '명의', '종목명', '보유수량(주)', '전월 평가금액', '당월말 평가금액', '전월대비 증감률(%)', '비고']];
    stock.list.forEach(s => {
      stkRows.push([
        s.date,
        s.person,
        s.name,
        Number(s.quantity),
        Number(s.prevValue || 0),
        Number(s.totalValue),
        s.diffRate !== null ? `${s.diffRate}%` : '신규',
        s.memo || ''
      ]);
    });
    const wsStk = XLSX.utils.aoa_to_sheet(stkRows);
    XLSX.utils.book_append_sheet(wb, wsStk, `${state.currentMonth}월_주식현황`);

    const finRows = [['명의', '형태', '상품명/기관', '시작~종료 기간', '금리(%)', '월 저축 금액(원)', '당월 누적 총 금액(원)']];
    assets.finList.forEach(f => {
      finRows.push([
        f.person,
        f.type,
        f.name,
        f.period,
        Number(f.rate),
        Number(f.savingsAmount),
        Number(f.displayTotalAmount ?? f.totalAmount)
      ]);
    });
    const wsFin = XLSX.utils.aoa_to_sheet(finRows);
    XLSX.utils.book_append_sheet(wb, wsFin, '금융자산현황');

    const realRows = [['명의', '형태', '자산명', '시작~종료 기간', '변동률(%)', '매입금액(원)', '현재 총금액(원)']];
    assets.realList.forEach(r => {
      realRows.push([r.person, r.type, r.name, r.period, Number(r.rate), Number(r.purchaseAmount), Number(r.totalAmount)]);
    });
    const wsReal = XLSX.utils.aoa_to_sheet(realRows);
    XLSX.utils.book_append_sheet(wb, wsReal, '실물자산현황');

    const fileName = `부부통합자산가계부_${state.currentYear}년_${state.currentMonth}월.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`📊 ${fileName} 다운로드 완료!`);
  }

  // ===================================================
  // 이벤트 리스너 바인딩
  // ===================================================
  document.querySelectorAll('#sidebarNav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      switchView(item.dataset.view);
    });
  });

  ['selectYear', 'ledgerSelectYear', 'stockSelectYear', 'assetSelectYear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', e => {
        state.currentYear = Number(e.target.value);
        renderAll();
      });
    }
  });

  ['selectMonth', 'ledgerSelectMonth', 'stockSelectMonth', 'assetSelectMonth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', e => {
        state.currentMonth = Number(e.target.value);
        renderAll();
      });
    }
  });

  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 1) {
      state.currentMonth = 12;
      state.currentYear--;
    }
    renderAll();
  });

  document.getElementById('btnNextMonth').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 12) {
      state.currentMonth = 1;
      state.currentYear++;
    }
    renderAll();
  });

  document.getElementById('btnToday').addEventListener('click', () => {
    state.currentYear = 2026;
    state.currentMonth = 7;
    renderAll();
  });

  document.querySelectorAll('.money-input').forEach(inp => bindMoneyFormatting(inp));

  // 금융 자산 등록 폼: 적금/청약 선택 시 '월 저축 금액'을 입력하면 시작 년/월 ~ 현재 월 기준으로 '총 금액' 자동 계산
  const finTypeEl = document.getElementById('finType');
  const finSavEl = document.getElementById('finSavingsAmt');
  const finTotEl = document.getElementById('finTotalAmt');

  function autoCalcInstallmentTotal() {
    if (!finSavEl || !finTotEl || !finTypeEl) return;
    if (finTypeEl.value === '적금' || finTypeEl.value === '청약') {
      const monthlySav = parseMoneyInput(finSavEl.value);
      if (monthlySav > 0) {
        const currYm = toYearMonth(state.currentYear, state.currentMonth);
        const startYm = state.finFormStartYm || currYm;
        const endYm = state.finFormEndYm || null;
        const effectiveYm = (endYm && currYm > endYm) ? endYm : currYm;
        const monthsCount = Math.max(1, diffMonthsInclusive(startYm, effectiveYm));
        finTotEl.value = fmtNum(monthlySav * monthsCount);
      }
    }
  }

  if (finSavEl && finTotEl && finTypeEl) {
    finSavEl.addEventListener('input', autoCalcInstallmentTotal);
    finTypeEl.addEventListener('change', autoCalcInstallmentTotal);
  }

  document.getElementById('husbandType').addEventListener('change', () => updatePersonCategoryOptions('husband'));
  document.getElementById('wifeType').addEventListener('change', () => updatePersonCategoryOptions('wife'));

  document.getElementById('formHusbandTx').addEventListener('submit', e => {
    e.preventDefault();
    const amt = parseMoneyInput(document.getElementById('husbandAmount').value);
    if (amt <= 0) return;
    const ym = toYearMonth(state.currentYear, state.currentMonth);
    Storage.addTransaction({
      yearMonth: ym,
      date: `${ym}-15`,
      person: '남편',
      type: document.getElementById('husbandType').value,
      category: document.getElementById('husbandCategory').value,
      amount: amt,
      memo: document.getElementById('husbandMemo').value.trim()
    });
    document.getElementById('husbandAmount').value = '';
    document.getElementById('husbandMemo').value = '';
    renderAll();
    showToast('🙋‍♂️ 남편 가계부 내역이 등록되었습니다.');
  });

  document.getElementById('formWifeTx').addEventListener('submit', e => {
    e.preventDefault();
    const amt = parseMoneyInput(document.getElementById('wifeAmount').value);
    if (amt <= 0) return;
    const ym = toYearMonth(state.currentYear, state.currentMonth);
    Storage.addTransaction({
      yearMonth: ym,
      date: `${ym}-15`,
      person: '아내',
      type: document.getElementById('wifeType').value,
      category: document.getElementById('wifeCategory').value,
      amount: amt,
      memo: document.getElementById('wifeMemo').value.trim()
    });
    document.getElementById('wifeAmount').value = '';
    document.getElementById('wifeMemo').value = '';
    renderAll();
    showToast('🙋‍♀️ 아내 가계부 내역이 등록되었습니다.');
  });

  document.getElementById('formStock').addEventListener('submit', e => {
    e.preventDefault();
    const qty = parseMoneyInput(document.getElementById('stkQty').value);
    const val = parseMoneyInput(document.getElementById('stkValue').value);
    if (val <= 0) return;
    const ym = toYearMonth(state.currentYear, state.currentMonth);
    Storage.addOrUpdateStock({
      yearMonth: ym,
      person: document.getElementById('stkPerson').value,
      name: document.getElementById('stkName').value.trim(),
      quantity: qty,
      totalValue: val,
      memo: document.getElementById('stkMemo').value.trim()
    });
    document.getElementById('stkName').value = '';
    document.getElementById('stkQty').value = '';
    document.getElementById('stkValue').value = '';
    document.getElementById('stkMemo').value = '';
    renderAll();
    showToast('📈 월말 주식 현황이 등록되었습니다.');
  });

  document.getElementById('btnCopyPrevStocks').addEventListener('click', () => {
    const count = Storage.carryOverPrevMonthStocks(state.currentYear, state.currentMonth);
    if (count > 0) {
      renderAll();
      showToast(`🔄 전월 주식 ${count}개 종목을 불러왔습니다.`);
    } else {
      showToast('ℹ️ 불러올 전월 종목이 없거나 이미 등록되어 있습니다.');
    }
  });

  // 자산 현황 폼의 기간 선택 버튼 클릭 시 팝업 오픈
  const btnFinPeriodPicker = document.getElementById('btnFinPeriodPicker');
  if (btnFinPeriodPicker) {
    btnFinPeriodPicker.addEventListener('click', () => {
      openPeriodModal({
        mode: 'fin_form',
        startYearMonth: state.finFormStartYm,
        endYearMonth: state.finFormEndYm,
        label: '금융 자산 신규 등록 기간 설정'
      });
    });
  }

  const btnRealPeriodPicker = document.getElementById('btnRealPeriodPicker');
  if (btnRealPeriodPicker) {
    btnRealPeriodPicker.addEventListener('click', () => {
      openPeriodModal({
        mode: 'real_form',
        startYearMonth: state.realFormStartYm,
        endYearMonth: state.realFormEndYm,
        label: '실물 자산 신규 등록 기간 설정'
      });
    });
  }

  document.getElementById('formFinAsset').addEventListener('submit', e => {
    e.preventDefault();
    Storage.addFinancialAsset({
      person: document.getElementById('finPerson').value,
      type: document.getElementById('finType').value,
      name: document.getElementById('finName').value.trim(),
      startYearMonth: state.finFormStartYm,
      endYearMonth: state.finFormEndYm,
      rate: document.getElementById('finRate').value,
      savingsAmount: parseMoneyInput(document.getElementById('finSavingsAmt').value),
      totalAmount: parseMoneyInput(document.getElementById('finTotalAmt').value)
    }, state.currentMonth, state.currentYear);
    document.getElementById('finName').value = '';
    document.getElementById('finRate').value = '';
    document.getElementById('finSavingsAmt').value = '';
    document.getElementById('finTotalAmt').value = '';
    renderAll();
    showToast('🏦 금융 자산이 등록되었습니다.');
  });

  document.getElementById('formRealAsset').addEventListener('submit', e => {
    e.preventDefault();
    Storage.addRealAsset({
      person: document.getElementById('realPerson').value,
      type: document.getElementById('realType').value,
      name: document.getElementById('realName').value.trim(),
      startYearMonth: state.realFormStartYm,
      endYearMonth: state.realFormEndYm,
      rate: document.getElementById('realRate').value,
      purchaseAmount: parseMoneyInput(document.getElementById('realPurchaseAmt').value),
      totalAmount: parseMoneyInput(document.getElementById('realTotalAmt').value)
    }, state.currentMonth, state.currentYear);
    document.getElementById('realName').value = '';
    document.getElementById('realRate').value = '';
    document.getElementById('realPurchaseAmt').value = '';
    document.getElementById('realTotalAmt').value = '';
    renderAll();
    showToast('🏠 실물 자산이 등록되었습니다.');
  });

  // ===================================================
  // 통합 시작 ~ 종료 년/월 지정 팝업 컨트롤러 (가계부 고정항목 & 자산 현황 공용)
  // ===================================================
  let periodModalContext = null;
  let isEndForeverMode = true;

  const fixedConvertModal = document.getElementById('fixedConvertModal');
  const fixModalHeaderTitle = fixedConvertModal ? fixedConvertModal.querySelector('h3') : null;
  const fixModalDescText = fixedConvertModal ? fixedConvertModal.querySelector('p') : null;
  const fixStartYearEl = document.getElementById('fixModalStartYear');
  const fixStartMonthEl = document.getElementById('fixModalStartMonth');
  const fixEndYearEl = document.getElementById('fixModalEndYear');
  const fixEndMonthEl = document.getElementById('fixModalEndMonth');
  const btnEndForever = document.getElementById('btnEndForever');
  const btnEndCustom = document.getElementById('btnEndCustom');
  const fixEndDateGroup = document.getElementById('fixModalEndDateGroup');
  const fixPeriodPreview = document.getElementById('fixModalPeriodPreview');

  function updateFixModalPreview() {
    if (!fixStartYearEl || !fixStartMonthEl || !fixPeriodPreview) return;
    const sY = fixStartYearEl.value;
    const sM = fixStartMonthEl.value;
    if (isEndForeverMode) {
      fixPeriodPreview.textContent = `시작/종료 : ${sY}.${sM} ~ 계속`;
    } else {
      const eY = fixEndYearEl.value;
      const eM = fixEndMonthEl.value;
      fixPeriodPreview.textContent = `시작/종료 : ${sY}.${sM} ~ ${eY}.${eM}`;
    }
  }

  function setEndMode(forever) {
    isEndForeverMode = forever;
    if (btnEndForever && btnEndCustom && fixEndDateGroup) {
      btnEndForever.classList.toggle('active-mode', forever);
      btnEndCustom.classList.toggle('active-mode', !forever);
      fixEndDateGroup.style.display = forever ? 'none' : 'grid';
    }
    updateFixModalPreview();
  }

  function openPeriodModal(ctx) {
    periodModalContext = ctx;
    const summaryBox = document.getElementById('fixedModalTargetSummary');
    const confirmBtn = document.getElementById('btnConfirmFixedModal');

    let defaultStartYm = toYearMonth(state.currentYear, state.currentMonth);
    let defaultEndYm = null;

    if (ctx.mode === 'ledger_fixed') {
      const item = ctx.item;
      const isCarry = Boolean(item.isFixedCarry);
      const isInc = item.type === 'income';
      const titleStr = isCarry ? (item.rawTitle || item.title || item.memo) : (item.memo || item.category);

      if (fixModalHeaderTitle) fixModalHeaderTitle.textContent = isCarry ? '📌 고정 항목 기간 설정' : '📌 고정 비용으로 지정하시겠습니까?';
      if (fixModalDescText) fixModalDescText.innerHTML = '선택한 항목의 <b>시작 년/월 ~ 종료 년/월(기본: 계속)</b>을 설정하여 매월 자동 이월합니다.';
      if (summaryBox) {
        summaryBox.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span class="tag-badge ${item.person === '남편' ? 'husband' : 'wife'}" style="margin-right:4px;">${escapeHtml(item.person)}</span>
              <span class="tag-badge ${isInc ? 'income' : 'expense'}" style="margin-right:6px;">${isInc ? '수입' : '지출'}</span>
              <b style="color:var(--text-primary);">[${escapeHtml(item.category)}] ${escapeHtml(titleStr)}</b>
            </div>
            <span style="font-family:var(--font-mono); font-weight:800; color:${isInc ? 'var(--up-green)' : 'var(--accent-orange-light)'};">${fmtWon(item.amount)}</span>
          </div>
        `;
      }
      if (isCarry && item.startYearMonth) defaultStartYm = item.startYearMonth;
      if (isCarry && item.endYearMonth) defaultEndYm = item.endYearMonth;
      if (confirmBtn) confirmBtn.textContent = isCarry ? '📌 기간 저장' : '📌 고정 비용으로 지정';
    } else if (ctx.mode === 'fin_asset_row' || ctx.mode === 'real_asset_row') {
      const item = ctx.item;
      if (fixModalHeaderTitle) fixModalHeaderTitle.textContent = '📅 자산 시작 ~ 종료 기간 설정';
      if (fixModalDescText) fixModalDescText.innerHTML = '해당 자산의 <b>시작 년/월(기본: 해당 월) ~ 종료 시점(기본: 계속)</b>을 지정합니다.';
      if (summaryBox) {
        summaryBox.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span class="tag-badge ${item.person === '남편' ? 'husband' : item.person === '아내' ? 'wife' : 'joint'}" style="margin-right:4px;">${escapeHtml(item.person)}</span>
              <b style="color:var(--text-primary);">[${escapeHtml(item.type)}] ${escapeHtml(item.name)}</b>
            </div>
          </div>
        `;
      }
      defaultStartYm = item.startYearMonth || defaultStartYm;
      defaultEndYm = item.endYearMonth || null;
      if (confirmBtn) confirmBtn.textContent = '📅 기간 저장';
    } else if (ctx.mode === 'fin_form' || ctx.mode === 'real_form') {
      if (fixModalHeaderTitle) fixModalHeaderTitle.textContent = '📅 신규 자산 기간 설정';
      if (fixModalDescText) fixModalDescText.innerHTML = '등록할 자산의 <b>시작 년/월(기본: 해당 월) ~ 종료 시점(기본: 계속)</b>을 선택하세요.';
      if (summaryBox) {
        summaryBox.innerHTML = `<div style="font-weight:700; color:var(--text-primary);">${escapeHtml(ctx.label)}</div>`;
      }
      defaultStartYm = ctx.startYearMonth || defaultStartYm;
      defaultEndYm = ctx.endYearMonth || null;
      if (confirmBtn) confirmBtn.textContent = '📅 기간 적용';
    }

    const [sy, sm] = defaultStartYm.split('-').map(Number);
    fixStartYearEl.value = sy;
    fixStartMonthEl.value = sm;

    if (defaultEndYm) {
      const [ey, em] = defaultEndYm.split('-').map(Number);
      fixEndYearEl.value = ey;
      fixEndMonthEl.value = em;
      setEndMode(false);
    } else {
      fixEndYearEl.value = state.currentYear;
      fixEndMonthEl.value = 12;
      setEndMode(true);
    }

    fixedConvertModal.classList.add('active');
  }

  function closeFixedConvertModal() {
    periodModalContext = null;
    if (fixedConvertModal) fixedConvertModal.classList.remove('active');
  }

  if (btnEndForever) btnEndForever.addEventListener('click', () => setEndMode(true));
  if (btnEndCustom) btnEndCustom.addEventListener('click', () => setEndMode(false));

  [fixStartYearEl, fixStartMonthEl, fixEndYearEl, fixEndMonthEl].forEach(el => {
    if (el) el.addEventListener('change', updateFixModalPreview);
  });

  document.getElementById('btnCloseFixedModal').addEventListener('click', closeFixedConvertModal);
  document.getElementById('btnCancelFixedModal').addEventListener('click', closeFixedConvertModal);
  if (fixedConvertModal) {
    fixedConvertModal.addEventListener('click', e => {
      if (e.target === fixedConvertModal) closeFixedConvertModal();
    });
  }

  document.getElementById('btnConfirmFixedModal').addEventListener('click', () => {
    if (!periodModalContext) return;
    const sY = Number(fixStartYearEl.value);
    const sM = Number(fixStartMonthEl.value);
    const startYm = toYearMonth(sY, sM);

    let endYm = null;
    if (!isEndForeverMode) {
      const eY = Number(fixEndYearEl.value);
      const eM = Number(fixEndMonthEl.value);
      endYm = toYearMonth(eY, eM);
      if (endYm < startYm) {
        alert('종료 년/월은 시작 년/월보다 같거나 이후여야 합니다.');
        return;
      }
    }

    const mode = periodModalContext.mode;
    const item = periodModalContext.item;

    if (mode === 'ledger_fixed') {
      if (item.isFixedCarry) {
        Storage.updateFixedExpense(item.id, {
          startYearMonth: startYm,
          endYearMonth: endYm
        });
        showToast(`📌 고정 기간(${formatPeriodDisplay(startYm, endYm)})이 수정되었습니다.`);
      } else {
        Storage.convertTxToFixed(item.id, startYm, endYm);
        showToast(`📌 고정 항목으로 지정되었습니다! (${formatPeriodDisplay(startYm, endYm)})`);
      }
      renderAll();
    } else if (mode === 'fin_asset_row') {
      Storage.updateFinancialAsset(item.id, {
        startYearMonth: startYm,
        endYearMonth: endYm
      }, state.currentMonth, state.currentYear);
      renderAll();
      showToast(`📅 금융 자산 기간(${formatPeriodDisplay(startYm, endYm)})이 수정되었습니다.`);
    } else if (mode === 'real_asset_row') {
      Storage.updateRealAsset(item.id, {
        startYearMonth: startYm,
        endYearMonth: endYm
      });
      renderAll();
      showToast(`📅 실물 자산 기간(${formatPeriodDisplay(startYm, endYm)})이 수정되었습니다.`);
    } else if (mode === 'fin_form') {
      state.finFormStartYm = startYm;
      state.finFormEndYm = endYm;
      updateAssetFormPeriodButtons();
      autoCalcInstallmentTotal();
      showToast(`📅 기간(${formatPeriodDisplay(startYm, endYm)})이 설정되었습니다.`);
    } else if (mode === 'real_form') {
      state.realFormStartYm = startYm;
      state.realFormEndYm = endYm;
      updateAssetFormPeriodButtons();
      showToast(`📅 기간(${formatPeriodDisplay(startYm, endYm)})이 설정되었습니다.`);
    }

    closeFixedConvertModal();
  });

  const openSaveModal = () => {
    Storage.save();
    showToast('💾 브라우저에 모든 데이터가 안전하게 저장되었습니다!');
    document.getElementById('saveModal').classList.add('active');
  };
  const btnSaveSide = document.getElementById('btnSaveDataSide');
  if (btnSaveSide) btnSaveSide.addEventListener('click', openSaveModal);

  const btnExcelSide = document.getElementById('btnExportExcelSide');
  if (btnExcelSide) btnExcelSide.addEventListener('click', exportIntegratedExcel);

  document.getElementById('btnCloseSaveModal').addEventListener('click', () => {
    document.getElementById('saveModal').classList.remove('active');
  });

  document.getElementById('btnExportJSON').addEventListener('click', () => {
    Storage.exportJSON();
    showToast('📥 통합 백업 파일(.json) 다운로드 완료!');
  });

  document.getElementById('btnImportJSONTrigger').addEventListener('click', () => {
    document.getElementById('fileInputJSON').click();
  });

  document.getElementById('fileInputJSON').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (Storage.importJSON(ev.target.result)) {
        renderAll();
        document.getElementById('saveModal').classList.remove('active');
        showToast('✅ 백업 데이터를 성공적으로 복원했습니다!');
      } else {
        alert('유효한 백업 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ===================================================
  // 부부 실시간 클라우드 동기화 (Firebase Firestore) 이벤트
  // ===================================================
  window.addEventListener('cloudStateSynced', e => {
    renderAll();
    const isInitial = e.detail && e.detail.initial;
    showToast(isInitial ? '☁️ 클라우드 가계부 데이터가 로드되었습니다!' : '☁️ 최신 변경 내역이 실시간 동기화되었습니다!');
  });

  const cloudModal = document.getElementById('cloudSyncModal');
  const adminConfigBox = document.getElementById('adminConfigBox');
  const btnToggleAdminConfig = document.getElementById('btnToggleAdminConfig');
  const endpointReadyBadge = document.getElementById('endpointReadyBadge');

  if (btnToggleAdminConfig && adminConfigBox) {
    btnToggleAdminConfig.addEventListener('click', () => {
      const isHidden = adminConfigBox.style.display === 'none';
      adminConfigBox.style.display = isHidden ? 'block' : 'none';
    });
  }

  const openCloudModal = () => {
    const familyInput = document.getElementById('inputFamilyCode');
    const configInput = document.getElementById('inputFirebaseConfigText');
    const syncObj = window.CloudSync || (typeof CloudSync !== 'undefined' ? CloudSync : null);

    // 보안을 위해 화면의 텍스트박스에는 Firebase 설정값을 절대 미리 채워서 노출하지 않음!
    if (configInput) {
      configInput.value = '';
    }

    if (syncObj) {
      if (familyInput) {
        familyInput.value = (syncObj.config && syncObj.config.familyCode) ? syncObj.config.familyCode : '';
      }

      const hasHiddenEndpoint = Boolean(syncObj.getHiddenEndpointConfig());
      if (endpointReadyBadge) {
        endpointReadyBadge.textContent = hasHiddenEndpoint
          ? '🔒 보안 클라우드 준비됨 (가족 방 코드만 입력하세요)'
          : '⚠️ 최초 1회 서버 키 등록 또는 초대 링크 접속 필요';
        endpointReadyBadge.style.color = hasHiddenEndpoint ? '#10b981' : '#fbbf24';
      }
      if (adminConfigBox) {
        adminConfigBox.style.display = hasHiddenEndpoint ? 'none' : 'block';
      }

      syncObj.updateStatusUI(
        syncObj.isConnected ? 'online' : (syncObj.config ? 'connecting' : 'offline'),
        syncObj.isConnected ? '실시간 동기화 중' : '로컬 모드'
      );
    }
    if (cloudModal) cloudModal.classList.add('active');
  };

  const closeCloudModal = () => {
    if (cloudModal) cloudModal.classList.remove('active');
  };

  const btnCloudSync = document.getElementById('btnCloudSync');
  if (btnCloudSync) btnCloudSync.addEventListener('click', openCloudModal);

  const btnCloudSyncSide = document.getElementById('btnCloudSyncSide');
  if (btnCloudSyncSide) btnCloudSyncSide.addEventListener('click', openCloudModal);

  const btnCloseCloudModal = document.getElementById('btnCloseCloudModal');
  if (btnCloseCloudModal) btnCloseCloudModal.addEventListener('click', closeCloudModal);

  if (cloudModal) {
    cloudModal.addEventListener('click', e => {
      if (e.target === cloudModal) closeCloudModal();
    });
  }

  // ===================================================
  // [초대 링크 복사] 핸들러 (연결된 내 화면에만 노출)
  // ===================================================
  const copyInviteLinkAction = async (e) => {
    const syncObj = window.CloudSync || (typeof CloudSync !== 'undefined' ? CloudSync : null);
    if (!syncObj) return;
    const link = syncObj.generateInviteLink();

    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
        copied = true;
      }
    } catch (err) {
      copied = false;
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err2) {
        copied = false;
      }
    }

    if (copied) {
      showToast(`📋 초대 링크 복사 완료! (${link})`);
      const targetBtn = e && e.currentTarget ? e.currentTarget : null;
      if (targetBtn) {
        const origHtml = targetBtn.innerHTML;
        targetBtn.innerHTML = '<span>✅</span><span>링크 복사 완료!</span>';
        setTimeout(() => {
          targetBtn.innerHTML = origHtml;
        }, 2000);
      }
    } else {
      prompt('아래 초대 링크를 복사(Ctrl+C)하여 카톡으로 친구에게 보내주세요:', link);
    }
  };

  const btnCopyInviteTop = document.getElementById('btnCopyInviteTop');
  if (btnCopyInviteTop) btnCopyInviteTop.addEventListener('click', copyInviteLinkAction);

  const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
  if (btnCopyInviteLink) btnCopyInviteLink.addEventListener('click', copyInviteLinkAction);

  // 친구 초대 링크 타고 접속 시 자동 안내 및 팝업 오픈
  const syncInitObj = window.CloudSync || (typeof CloudSync !== 'undefined' ? CloudSync : null);
  if (syncInitObj && (syncInitObj._invitedJustNow || syncInitObj.checkInviteFromUrl())) {
    syncInitObj._invitedJustNow = false;
    setTimeout(() => {
      openCloudModal();
      const familyInput = document.getElementById('inputFamilyCode');
      if (familyInput) {
        familyInput.value = '';
        familyInput.focus();
      }
      showToast('💌 초대 링크로 접속했습니다! 부부 가족 방 코드를 입력하면 바로 공유됩니다.');
    }, 450);
  }

  const btnConnectCloud = document.getElementById('btnConnectCloud');
  if (btnConnectCloud) {
    btnConnectCloud.addEventListener('click', async () => {
      const syncObj = window.CloudSync || (typeof CloudSync !== 'undefined' ? CloudSync : null);
      if (!syncObj) return;

      const familyCode = document.getElementById('inputFamilyCode').value.trim();
      const configInput = document.getElementById('inputFirebaseConfigText');
      const configText = configInput ? configInput.value.trim() : '';

      if (!familyCode || familyCode.length < 2) {
        alert('부부 두 분이 함께 사용할 가족 방 코드(비밀번호)를 최소 2글자 이상 입력해 주세요.');
        document.getElementById('inputFamilyCode').focus();
        return;
      }

      let parsedConfig = null;
      if (configText) {
        parsedConfig = syncObj.parseFirebaseConfigInput(configText);
        if (!parsedConfig) {
          alert('Firebase 설정값을 올바르게 인식하지 못했습니다.\nFirebase 콘솔의 firebaseConfig 객체 코드를 복사해 그대로 붙여넣어 주세요.');
          return;
        }
        // 보안을 위해 입력창에 남아있는 텍스트는 즉시 지움
        if (configInput) configInput.value = '';
      } else {
        parsedConfig = syncObj.getHiddenEndpointConfig();
      }

      if (!parsedConfig || !parsedConfig.apiKey || !parsedConfig.projectId) {
        if (adminConfigBox) adminConfigBox.style.display = 'block';
        alert('최초 1회 서버 연결 키 등록이 필요합니다.\n초대 링크로 접속하거나 아래 [서버 키 재설정] 칸에 Firebase 설정 코드를 한 번만 붙여넣어 주세요.');
        if (configInput) configInput.focus();
        return;
      }

      btnConnectCloud.disabled = true;
      btnConnectCloud.textContent = '⏳ 클라우드 연결 및 동기화 중...';

      const res = await syncObj.connect({ ...parsedConfig, familyCode }, true);

      btnConnectCloud.disabled = false;
      btnConnectCloud.textContent = '🚀 가족 방 코드로 실시간 연결 시작';

      if (res.success) {
        renderAll();
        closeCloudModal();
        showToast('🎉 부부 실시간 클라우드 동기화가 연결되었습니다!');
      } else {
        alert(`클라우드 연결 실패:\n${res.error}\n\n인터넷 연결을 확인해 주세요.`);
      }
    });
  }

  const btnDisconnectCloud = document.getElementById('btnDisconnectCloud');
  if (btnDisconnectCloud) {
    btnDisconnectCloud.addEventListener('click', () => {
      if (confirm('클라우드 동기화를 해제하고 로컬 단독 모드로 전환하시겠습니까?\n(현재 저장된 데이터는 기기에 안전하게 유지됩니다)')) {
        CloudSync.clearConfig();
        closeCloudModal();
        showToast('⚪ 로컬 모드로 전환되었습니다.');
      }
    });
  }

  initSelectors();
  initDragAndDropZones();
  renderAll();
});

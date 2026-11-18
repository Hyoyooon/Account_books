/**
 * storage.js - 부부 통합 가계부 · 주식 · 자산 스토어
 * - 고정 항목 금액 수정 시 과거 월 금액 보존 & 수정 월 이후부터 새 금액 적용 (이력 분할)
 * - 고정 항목 -> 일반 가계부 내역 복귀 (드래그 앤 드롭 & 이월중단 연동)
 * - 자산 현황(금융·실물) 시작/종료 년월(기본: 해당 월 ~ 계속) 지정 및 적금 월저축액 누적 계산
 */

const STORAGE_KEYS = {
  STATE_EXCEL_V6: 'sweet_ledger_pro_excel_v6',
  LEGACY_KEYS: [
    'sweet_ledger_pro_excel_v5',
    'sweet_ledger_pro_excel_v4',
    'sweet_ledger_pro_state_v3_clean',
    'sweet_ledger_pro_state_v2',
    'couple_ledger_transactions_v1',
    'couple_ledger_settings_v1'
  ]
};

const CATEGORIES = {
  income: ['월급', '야근수당', '연차수당', '상여금', '부수입', '기타'],
  expense: ['용돈', '저축', '식비', '주거', '통신', '교통', '모임(계)', '취미', '보험', '경조사', '기타']
};

function getLastDayOfMonth(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function toYearMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getPrevYearMonth(year, month, offset = 1) {
  const d = new Date(year, month - 1 - offset, 1);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    ym: toYearMonth(d.getFullYear(), d.getMonth() + 1)
  };
}

function formatPeriodDisplay(startYm, endYm) {
  const s = (startYm || '2026-01').replace('-', '.');
  const e = endYm ? endYm.replace('-', '.') : '계속';
  return `${s} ~ ${e}`;
}

function diffMonthsInclusive(startYm, targetYm) {
  const [sy, sm] = (startYm || '2026-01').split('-').map(Number);
  const [ty, tm] = (targetYm || '2026-01').split('-').map(Number);
  return (ty - sy) * 12 + (tm - sm) + 1;
}

/**
 * 초기 상태 생성
 * - 로컬 PC에 js/private_seed.js가 있으면 사용자 데이터를 로드
 * - GitHub Pages 등 외부 공개 환경에서는 개인 데이터가 전혀 없는 깨끗한 빈 상태(0원)로 시작
 */
function createInitialState() {
  if (window.PRIVATE_EXCEL_SEED) {
    return JSON.parse(JSON.stringify(window.PRIVATE_EXCEL_SEED));
  }
  return {
    transactions: [],
    fixedExpenses: [],
    stocks: [],
    financialAssets: [],
    realAssets: []
  };
}

const Storage = {
  state: null,

  init() {
    STORAGE_KEYS.LEGACY_KEYS.forEach(k => localStorage.removeItem(k));

    const raw = localStorage.getItem(STORAGE_KEYS.STATE_EXCEL_V6);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.state = {
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          fixedExpenses: Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : [],
          stocks: Array.isArray(parsed.stocks) ? parsed.stocks : [],
          financialAssets: Array.isArray(parsed.financialAssets) ? parsed.financialAssets : [],
          realAssets: Array.isArray(parsed.realAssets) ? parsed.realAssets : []
        };
      } catch (e) {
        this.state = createInitialState();
        this.save();
      }
    } else {
      this.state = createInitialState();
      this.save();
    }
  },

  save() {
    localStorage.setItem(STORAGE_KEYS.STATE_EXCEL_V6, JSON.stringify(this.state));
  },

  // ===================================================
  // 1. 가계부 (수입/지출 & 고정비용 이월 & 이력 분할 수정)
  // ===================================================
  getActiveFixedExpenses(year, month) {
    const ym = toYearMonth(year, month);
    return (this.state.fixedExpenses || []).filter(fix => {
      const started = !fix.startYearMonth || fix.startYearMonth <= ym;
      const notEnded = !fix.endYearMonth || fix.endYearMonth >= ym;
      return started && notEnded;
    });
  },

  getMonthTransactions(year, month) {
    const ym = toYearMonth(year, month);
    return (this.state.transactions || []).filter(tx => {
      const txYm = tx.yearMonth || (tx.date ? tx.date.slice(0, 7) : '');
      return txYm === ym;
    });
  },

  addTransaction(tx) {
    const ym = tx.yearMonth || (tx.date ? tx.date.slice(0, 7) : '2026-05');
    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      yearMonth: ym,
      date: tx.date || `${ym}-15`,
      person: tx.person,
      type: tx.type,
      category: tx.category,
      amount: Number(tx.amount) || 0,
      memo: tx.memo || ''
    };
    this.state.transactions.unshift(newTx);
    this.save();
    return newTx;
  },

  updateTransaction(id, fields) {
    const target = this.state.transactions.find(t => t.id === id);
    if (!target) return false;
    if (fields.type !== undefined) target.type = fields.type;
    if (fields.category !== undefined) target.category = fields.category;
    if (fields.amount !== undefined) target.amount = Number(fields.amount) || 0;
    if (fields.memo !== undefined) target.memo = fields.memo;
    if (fields.person !== undefined) target.person = fields.person;
    this.save();
    return true;
  },

  deleteTransaction(id) {
    this.state.transactions = this.state.transactions.filter(t => t.id !== id);
    this.save();
  },

  addFixedExpense(fix) {
    const newFix = {
      id: 'fix_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      person: fix.person || '남편',
      type: fix.type || 'expense',
      category: fix.category || (fix.type === 'income' ? '월급' : '주거'),
      title: fix.title || (fix.type === 'income' ? '고정 수입' : '고정 지출'),
      amount: Number(fix.amount) || 0,
      startYearMonth: fix.startYearMonth || '2026-01',
      endYearMonth: fix.endYearMonth || null
    };
    this.state.fixedExpenses.push(newFix);
    this.save();
    return newFix;
  },

  convertTxToFixed(txId, startYearMonth, endYearMonth = null) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return null;

    const newFix = this.addFixedExpense({
      person: tx.person,
      type: tx.type || 'expense',
      category: tx.category,
      title: tx.memo || `${tx.category} (${tx.type === 'income' ? '고정수입' : '고정지출'})`,
      amount: tx.amount,
      startYearMonth: startYearMonth || tx.yearMonth,
      endYearMonth: endYearMonth || null
    });

    const txYm = tx.yearMonth || (tx.date ? tx.date.slice(0, 7) : '');
    const inRange = (!startYearMonth || startYearMonth <= txYm) && (!endYearMonth || endYearMonth >= txYm);
    if (inRange) {
      this.state.transactions = this.state.transactions.filter(t => t.id !== txId);
    }

    this.save();
    return newFix;
  },

  /**
   * 요구사항 1: 고정 항목의 금액(또는 내용) 변경 시:
   * - 만약 시작월(예: 2026-01)보다 이후 달(예: 2026-07)에서 금액을 수정하면,
   *   2026-01 ~ 2026-06까지는 기존 금액(1,000원)으로 유지하고,
   *   2026-07 ~ 기존 종료일(계속)까지는 새 금액(2,000원)으로 분할 저장!
   */
  updateFixedExpense(id, fields, currentYear = null, currentMonth = null) {
    const target = this.state.fixedExpenses.find(f => f.id === id);
    if (!target) return false;

    const currentYm = (currentYear && currentMonth) ? toYearMonth(currentYear, currentMonth) : null;
    const isContentChanged =
      (fields.amount !== undefined && Number(fields.amount) !== Number(target.amount)) ||
      (fields.title !== undefined && fields.title !== target.title) ||
      (fields.category !== undefined && fields.category !== target.category) ||
      (fields.person !== undefined && fields.person !== target.person) ||
      (fields.type !== undefined && fields.type !== (target.type || 'expense'));

    // 시작월 이후의 달에서 금액/내용을 변경한 경우 -> 과거 월 보존을 위해 이력 분할!
    if (currentYm && target.startYearMonth < currentYm && isContentChanged && fields.startYearMonth === undefined) {
      const prev = getPrevYearMonth(currentYear, currentMonth, 1);
      const originalEndYm = target.endYearMonth || null;

      // 1) 기존 항목은 직전 월(예: 2026-06)까지만 적용되도록 종료일 마감
      target.endYearMonth = prev.ym;

      // 2) 현재 월(예: 2026-07)부터 시작하는 새 금액의 고정 항목 생성
      this.addFixedExpense({
        person: fields.person !== undefined ? fields.person : target.person,
        type: fields.type !== undefined ? fields.type : (target.type || 'expense'),
        category: fields.category !== undefined ? fields.category : target.category,
        title: fields.title !== undefined ? fields.title : target.title,
        amount: fields.amount !== undefined ? Number(fields.amount) : target.amount,
        startYearMonth: currentYm,
        endYearMonth: originalEndYm
      });

      this.save();
      return 'split';
    }

    // 시작월 당월에서 수정했거나 기간(startYearMonth/endYearMonth)만 수정한 경우
    if (fields.person !== undefined) target.person = fields.person;
    if (fields.type !== undefined) target.type = fields.type;
    if (fields.category !== undefined) target.category = fields.category;
    if (fields.title !== undefined) target.title = fields.title;
    if (fields.amount !== undefined) target.amount = Number(fields.amount) || 0;
    if (fields.startYearMonth !== undefined) target.startYearMonth = fields.startYearMonth;
    if (fields.endYearMonth !== undefined) target.endYearMonth = fields.endYearMonth || null;
    this.save();
    return 'updated';
  },

  /**
   * 요구사항 3: 고정 비용에서 '이월중단'을 누르거나 위쪽 남편/아내 가계부로 끌어다 놓았을 때,
   * 고정 이월을 중단함과 동시에 해당 월의 위쪽 남편/아내 일반 가계부 내역으로 복원!
   */
  revertFixedToNormalTx(id, year, month, overridePerson = null) {
    const target = this.state.fixedExpenses.find(f => f.id === id);
    if (!target) return null;

    const ym = toYearMonth(year, month);
    const person = overridePerson || target.person || '남편';

    // 1) 위쪽 남편/아내 가계부의 당월 일반 내역으로 추가
    const restoredTx = this.addTransaction({
      yearMonth: ym,
      date: `${ym}-15`,
      person,
      type: target.type || 'expense',
      category: target.category,
      amount: target.amount,
      memo: target.title
    });

    // 2) 고정 비용 목록에서는 이번 달부터 이월 중단 (시작월이 이번 달이면 완전 제거, 이전 달이면 지난달로 종료 마감)
    this.stopFixedExpenseFromMonth(id, year, month);
    return restoredTx;
  },

  stopFixedExpenseFromMonth(id, year, month) {
    const prev = getPrevYearMonth(year, month, 1);
    const target = this.state.fixedExpenses.find(f => f.id === id);
    if (target) {
      if (target.startYearMonth >= toYearMonth(year, month)) {
        this.state.fixedExpenses = this.state.fixedExpenses.filter(f => f.id !== id);
      } else {
        target.endYearMonth = prev.ym;
      }
      this.save();
    }
  },

  getMonthLedgerSummary(year, month) {
    const txList = this.getMonthTransactions(year, month);
    const fixedList = this.getActiveFixedExpenses(year, month);
    const ym = toYearMonth(year, month);

    let husbandIncome = 0;
    let wifeIncome = 0;
    let husbandVarExpense = 0;
    let wifeVarExpense = 0;
    let husbandFixedExpense = 0;
    let wifeFixedExpense = 0;
    let extraSavingsFromTx = 0;

    const combinedTransactions = [...txList];

    txList.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        if (t.person === '남편') husbandIncome += amt;
        else wifeIncome += amt;
      } else {
        if (t.category === '저축') {
          extraSavingsFromTx += amt;
        } else {
          if (t.person === '남편') husbandVarExpense += amt;
          else wifeVarExpense += amt;
        }
      }
    });

    fixedList.forEach(f => {
      const amt = Number(f.amount) || 0;
      const fixType = f.type || 'expense';

      if (fixType === 'income') {
        if (f.person === '남편') husbandIncome += amt;
        else wifeIncome += amt;
      } else {
        if (f.category === '저축') {
          extraSavingsFromTx += amt;
        } else {
          if (f.person === '남편') husbandFixedExpense += amt;
          else wifeFixedExpense += amt;
        }
      }

      combinedTransactions.push({
        id: f.id,
        yearMonth: ym,
        date: `${ym}-01`,
        person: f.person,
        type: fixType,
        category: f.category,
        amount: amt,
        memo: `[고정이월] ${f.title}`,
        rawTitle: f.title,
        isFixedCarry: true,
        startYearMonth: f.startYearMonth,
        endYearMonth: f.endYearMonth
      });
    });

    const husbandExpense = husbandVarExpense + husbandFixedExpense;
    const wifeExpense = wifeVarExpense + wifeFixedExpense;
    const totalIncome = husbandIncome + wifeIncome;
    const totalFixed = husbandFixedExpense + wifeFixedExpense;
    const totalExpense = husbandExpense + wifeExpense;
    const netBalance = totalIncome - totalExpense;

    const assetSummary = this.getAssetsSummary(month, year);
    const monthlySavings = assetSummary.finSavingsSum + extraSavingsFromTx;

    return {
      year,
      month,
      ym,
      husbandIncome,
      wifeIncome,
      husbandVarExpense,
      wifeVarExpense,
      husbandFixedExpense,
      wifeFixedExpense,
      husbandExpense,
      wifeExpense,
      totalIncome,
      totalFixed,
      totalExpense,
      netBalance,
      monthlySavings,
      afterSavingsBalance: netBalance - monthlySavings,
      txList,
      fixedList,
      combinedTransactions
    };
  },

  getLedgerMoM(year, month) {
    const curr = this.getMonthLedgerSummary(year, month);
    const prevDate = getPrevYearMonth(year, month, 1);
    const prev = this.getMonthLedgerSummary(prevDate.year, prevDate.month);

    const calcRate = (c, p) => {
      if (!p || p === 0) return 0;
      return Number((((c - p) / p) * 100).toFixed(1));
    };

    return {
      curr,
      prev,
      incomeDiff: curr.totalIncome - prev.totalIncome,
      incomeRate: calcRate(curr.totalIncome, prev.totalIncome),
      expenseDiff: curr.totalExpense - prev.totalExpense,
      expenseRate: calcRate(curr.totalExpense, prev.totalExpense),
      balanceDiff: curr.netBalance - prev.netBalance,
      balanceRate: calcRate(curr.netBalance, Math.abs(prev.netBalance))
    };
  },

  // ===================================================
  // 2. 주식 현황
  // ===================================================
  getStocksByMonth(year, month) {
    const ym = toYearMonth(year, month);
    const prevDate = getPrevYearMonth(year, month, 1);
    const prevYm = prevDate.ym;

    const currStocks = (this.state.stocks || []).filter(s => s.yearMonth === ym);
    const prevStocks = (this.state.stocks || []).filter(s => s.yearMonth === prevYm);

    return currStocks.map(item => {
      const prevMatch = prevStocks.find(
        p => p.person === item.person && p.name.trim() === item.name.trim()
      );
      const prevVal = prevMatch ? Number(prevMatch.totalValue) : 0;
      const currVal = Number(item.totalValue) || 0;
      const diffVal = prevMatch ? currVal - prevVal : 0;
      const diffRate = prevMatch && prevVal > 0
        ? Number((((currVal - prevVal) / prevVal) * 100).toFixed(1))
        : null;

      return {
        ...item,
        prevValue: prevVal,
        diffValue: diffVal,
        diffRate
      };
    });
  },

  addOrUpdateStock(stock) {
    const ym = stock.yearMonth;
    const [y, m] = ym.split('-').map(Number);
    const lastDate = getLastDayOfMonth(y, m);

    const newStock = {
      id: 'stk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      yearMonth: ym,
      date: lastDate,
      person: stock.person,
      name: stock.name.trim(),
      quantity: Number(stock.quantity) || 0,
      totalValue: Number(stock.totalValue) || 0,
      memo: stock.memo || ''
    };
    this.state.stocks.push(newStock);
    this.save();
    return newStock;
  },

  updateStock(id, fields) {
    const target = this.state.stocks.find(s => s.id === id);
    if (!target) return false;
    if (fields.person !== undefined) target.person = fields.person;
    if (fields.name !== undefined) target.name = fields.name.trim();
    if (fields.quantity !== undefined) target.quantity = Number(fields.quantity) || 0;
    if (fields.totalValue !== undefined) target.totalValue = Number(fields.totalValue) || 0;
    if (fields.memo !== undefined) target.memo = fields.memo;
    this.save();
    return true;
  },

  deleteStock(id) {
    this.state.stocks = this.state.stocks.filter(s => s.id !== id);
    this.save();
  },

  carryOverPrevMonthStocks(year, month) {
    const ym = toYearMonth(year, month);
    const lastDate = getLastDayOfMonth(year, month);
    const prev = getPrevYearMonth(year, month, 1);
    const prevStocks = (this.state.stocks || []).filter(s => s.yearMonth === prev.ym);
    if (prevStocks.length === 0) return 0;

    let count = 0;
    prevStocks.forEach(ps => {
      const exists = this.state.stocks.some(
        s => s.yearMonth === ym && s.person === ps.person && s.name === ps.name
      );
      if (!exists) {
        this.state.stocks.push({
          id: 'stk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          yearMonth: ym,
          date: lastDate,
          person: ps.person,
          name: ps.name,
          quantity: ps.quantity,
          totalValue: ps.totalValue,
          memo: ps.memo
        });
        count++;
      }
    });
    this.save();
    return count;
  },

  getStockMonthSummary(year, month) {
    const list = this.getStocksByMonth(year, month);
    const prevDate = getPrevYearMonth(year, month, 1);
    const prevList = (this.state.stocks || []).filter(s => s.yearMonth === prevDate.ym);

    let husbandTotal = 0;
    let wifeTotal = 0;
    list.forEach(s => {
      if (s.person === '남편') husbandTotal += Number(s.totalValue) || 0;
      else wifeTotal += Number(s.totalValue) || 0;
    });

    let prevTotal = 0;
    prevList.forEach(s => {
      prevTotal += Number(s.totalValue) || 0;
    });

    const currTotal = husbandTotal + wifeTotal;
    const diffVal = currTotal - prevTotal;
    const diffRate = prevTotal > 0 ? Number((((currTotal - prevTotal) / prevTotal) * 100).toFixed(1)) : 0;

    return {
      husbandTotal,
      wifeTotal,
      currTotal,
      prevTotal,
      diffVal,
      diffRate,
      list
    };
  },

  getAnnualStockSeries(year) {
    const labels = [];
    const totalSeries = [];
    const husbandSeries = [];
    const wifeSeries = [];
    const momRates = [];

    for (let m = 1; m <= 12; m++) {
      labels.push(`${m}월`);
      const summary = this.getStockMonthSummary(year, m);
      totalSeries.push(summary.currTotal);
      husbandSeries.push(summary.husbandTotal);
      wifeSeries.push(summary.wifeTotal);
      momRates.push(summary.diffRate);
    }

    return { labels, totalSeries, husbandSeries, wifeSeries, momRates };
  },

  // ===================================================
  // 3. 자산 현황 (시작 ~ 종료일 지정 & 적금 매월 저축금액 기준 총 금액 계산)
  // ===================================================
  computeFinAssetMonthTotal(item, month, year = 2026) {
    const m = Math.max(1, Math.min(12, Number(month) || 1));
    const targetYm = toYearMonth(year, m);
    const startYm = item.startYearMonth || toYearMonth(year, item.startMonth || 1);
    const endYm = item.endYearMonth || null;

    if (targetYm < startYm) return 0;

    if (Array.isArray(item.customMonthlyBalances) && item.customMonthlyBalances[m - 1] !== undefined) {
      return Number(item.customMonthlyBalances[m - 1]) || 0;
    }

    const monthlySav = Number(item.savingsAmount) || 0;
    const isInstallment = item.type === '적금' || item.type === '청약' || monthlySav > 0;

    if (isInstallment && monthlySav > 0) {
      const effectiveYm = (endYm && targetYm > endYm) ? endYm : targetYm;
      const monthsCount = Math.max(0, diffMonthsInclusive(startYm, effectiveYm));
      const base = Number(item.baseBalance) || 0;
      return base + (monthlySav * monthsCount);
    }

    return Number(item.totalAmount ?? item.baseBalance) || 0;
  },

  getFinancialAssets(month = 5, year = 2026) {
    const list = this.state.financialAssets || [];
    return list.map(item => {
      const startYm = item.startYearMonth || toYearMonth(year, item.startMonth || 1);
      const endYm = item.endYearMonth || null;
      const monthTotal = this.computeFinAssetMonthTotal(item, month, year);
      return {
        ...item,
        startYearMonth: startYm,
        endYearMonth: endYm,
        period: formatPeriodDisplay(startYm, endYm),
        displayTotalAmount: monthTotal
      };
    });
  },

  addFinancialAsset(item, currentMonth = 1, currentYear = 2026) {
    const type = item.type || '예금';
    const savingsAmt = Number(item.savingsAmount) || 0;
    const inputTotal = Number(item.totalAmount) || 0;
    const startYm = item.startYearMonth || toYearMonth(currentYear, currentMonth);
    const endYm = item.endYearMonth || null;
    const currYm = toYearMonth(currentYear, currentMonth);

    let baseBalance = 0;
    if (type === '적금' || type === '청약') {
      const monthsCount = Math.max(1, diffMonthsInclusive(startYm, currYm));
      const expectedFromSavings = savingsAmt * monthsCount;
      baseBalance = inputTotal >= expectedFromSavings ? (inputTotal - expectedFromSavings) : 0;
    } else {
      baseBalance = inputTotal;
    }

    const newItem = {
      id: 'fin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      person: item.person || '공동',
      type,
      name: item.name || '',
      startYearMonth: startYm,
      endYearMonth: endYm,
      period: formatPeriodDisplay(startYm, endYm),
      rate: Number(item.rate) || 0,
      savingsAmount: savingsAmt,
      baseBalance,
      totalAmount: inputTotal || savingsAmt,
      startMonth: Number(startYm.split('-')[1]) || 1
    };
    this.state.financialAssets.push(newItem);
    this.save();
    return newItem;
  },

  updateFinancialAsset(id, fields, currentMonth = 1, currentYear = 2026) {
    const target = this.state.financialAssets.find(f => f.id === id);
    if (!target) return false;

    if (fields.person !== undefined) target.person = fields.person;
    if (fields.type !== undefined) target.type = fields.type;
    if (fields.name !== undefined) target.name = fields.name;
    if (fields.startYearMonth !== undefined) {
      target.startYearMonth = fields.startYearMonth;
      target.startMonth = Number(fields.startYearMonth.split('-')[1]) || 1;
    }
    if (fields.endYearMonth !== undefined) {
      target.endYearMonth = fields.endYearMonth || null;
    }
    target.period = formatPeriodDisplay(target.startYearMonth || '2026-01', target.endYearMonth);

    if (fields.rate !== undefined) target.rate = Number(fields.rate) || 0;

    const newSavingsAmt = fields.savingsAmount !== undefined ? (Number(fields.savingsAmount) || 0) : target.savingsAmount;
    const newTotalAmt = fields.totalAmount !== undefined ? (Number(fields.totalAmount) || 0) : null;

    target.savingsAmount = newSavingsAmt;

    if (target.customMonthlyBalances && newTotalAmt !== null) {
      delete target.customMonthlyBalances;
    }

    const currYm = toYearMonth(currentYear, currentMonth);
    const startYm = target.startYearMonth || '2026-01';

    if (target.type === '적금' || target.type === '청약' || newSavingsAmt > 0) {
      const monthsCount = Math.max(1, diffMonthsInclusive(startYm, currYm));
      const prevExpectedTotal = (Number(target.baseBalance) || 0) + (newSavingsAmt * monthsCount);

      if (newTotalAmt !== null && fields.totalAmountChangedExplicitly) {
        target.baseBalance = Math.max(0, newTotalAmt - (newSavingsAmt * monthsCount));
        target.totalAmount = newTotalAmt;
      } else {
        target.totalAmount = prevExpectedTotal;
      }
    } else if (newTotalAmt !== null) {
      target.baseBalance = newTotalAmt;
      target.totalAmount = newTotalAmt;
    }

    this.save();
    return true;
  },

  deleteFinancialAsset(id) {
    this.state.financialAssets = this.state.financialAssets.filter(f => f.id !== id);
    this.save();
  },

  getRealAssets() {
    return (this.state.realAssets || []).map(item => {
      const startYm = item.startYearMonth || '2026-01';
      const endYm = item.endYearMonth || null;
      return {
        ...item,
        startYearMonth: startYm,
        endYearMonth: endYm,
        period: formatPeriodDisplay(startYm, endYm)
      };
    });
  },

  addRealAsset(item, currentMonth = 1, currentYear = 2026) {
    const startYm = item.startYearMonth || toYearMonth(currentYear, currentMonth);
    const endYm = item.endYearMonth || null;
    const newItem = {
      id: 'real_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      person: item.person || '공동',
      type: item.type || '부동산',
      name: item.name || '',
      startYearMonth: startYm,
      endYearMonth: endYm,
      period: formatPeriodDisplay(startYm, endYm),
      rate: Number(item.rate) || 0,
      purchaseAmount: Number(item.purchaseAmount) || 0,
      totalAmount: Number(item.totalAmount) || 0
    };
    this.state.realAssets.push(newItem);
    this.save();
    return newItem;
  },

  updateRealAsset(id, fields) {
    const target = this.state.realAssets.find(r => r.id === id);
    if (!target) return false;
    if (fields.person !== undefined) target.person = fields.person;
    if (fields.type !== undefined) target.type = fields.type;
    if (fields.name !== undefined) target.name = fields.name;
    if (fields.startYearMonth !== undefined) target.startYearMonth = fields.startYearMonth;
    if (fields.endYearMonth !== undefined) target.endYearMonth = fields.endYearMonth || null;
    target.period = formatPeriodDisplay(target.startYearMonth || '2026-01', target.endYearMonth);
    if (fields.rate !== undefined) target.rate = Number(fields.rate) || 0;
    if (fields.purchaseAmount !== undefined) target.purchaseAmount = Number(fields.purchaseAmount) || 0;
    if (fields.totalAmount !== undefined) target.totalAmount = Number(fields.totalAmount) || 0;
    this.save();
    return true;
  },

  deleteRealAsset(id) {
    this.state.realAssets = this.state.realAssets.filter(r => r.id !== id);
    this.save();
  },

  getAssetsSummary(month = 5, year = 2026) {
    const finList = this.getFinancialAssets(month, year);
    const realList = this.getRealAssets();

    const finSavingsSum = finList.reduce((acc, cur) => acc + (Number(cur.savingsAmount) || 0), 0);
    const finTotalSum = finList.reduce((acc, cur) => acc + (Number(cur.displayTotalAmount ?? cur.totalAmount) || 0), 0);

    const realPurchaseSum = realList.reduce((acc, cur) => acc + (Number(cur.purchaseAmount) || 0), 0);
    const realTotalSum = realList.reduce((acc, cur) => acc + (Number(cur.totalAmount) || 0), 0);

    return {
      finList,
      realList,
      finSavingsSum,
      finTotalSum,
      realPurchaseSum,
      realTotalSum,
      combinedAssetsTotal: finTotalSum + realTotalSum
    };
  },

  // ===================================================
  // 4. 전체 현황 - 1년간 전체 자산 증감 계산
  // ===================================================
  getAnnualTotalNetWorth(year, selectedMonth) {
    const monthNamesEng = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthlyItems = [];

    for (let m = 1; m <= 12; m++) {
      const ledger = this.getMonthLedgerSummary(year, m);
      const stock = this.getStockMonthSummary(year, m);
      const assetSummary = this.getAssetsSummary(m, year);

      let effectiveStockTotal = stock.currTotal;
      if (effectiveStockTotal === 0 && m > 1 && monthlyItems[m - 2]) {
        effectiveStockTotal = monthlyItems[m - 2].stockTotal;
      }

      const totalNetWorth = assetSummary.finTotalSum + assetSummary.realTotalSum + effectiveStockTotal;

      let depositSum = 0;
      let installmentSum = 0;
      assetSummary.finList.forEach(f => {
        if (f.type === '예금') depositSum += f.displayTotalAmount;
        else installmentSum += f.displayTotalAmount;
      });

      monthlyItems.push({
        month: m,
        labelEng: monthNamesEng[m - 1],
        labelKor: `${m}월`,
        ledgerCumulativeSavings: installmentSum,
        monthlySavingsInput: ledger.monthlySavings,
        stockTotal: effectiveStockTotal,
        financialTotal: depositSum,
        finFullTotal: assetSummary.finTotalSum,
        realTotal: assetSummary.realTotalSum,
        totalNetWorth
      });
    }

    monthlyItems.forEach((item, idx) => {
      if (idx === 0) {
        const prevDecBase = item.totalNetWorth - item.monthlySavingsInput;
        item.momRate = prevDecBase > 0
          ? Number((((item.totalNetWorth - prevDecBase) / prevDecBase) * 100).toFixed(2))
          : 0;
      } else {
        const prevVal = monthlyItems[idx - 1].totalNetWorth;
        item.momRate = prevVal > 0
          ? Number((((item.totalNetWorth - prevVal) / prevVal) * 100).toFixed(2))
          : 0;
      }
    });

    const currIdx = Math.max(0, Math.min(11, selectedMonth - 1));
    const currentItem = monthlyItems[currIdx];

    const calcPeriodGrowth = (monthsBack) => {
      const targetIdx = Math.max(0, currIdx - monthsBack);
      const pastVal = monthlyItems[targetIdx].totalNetWorth;
      if (!pastVal || pastVal === 0) return 0;
      return Number((((currentItem.totalNetWorth - pastVal) / pastVal) * 100).toFixed(1));
    };

    return {
      monthlyItems,
      currentItem,
      growth3m: calcPeriodGrowth(3),
      growth6m: calcPeriodGrowth(6),
      growth1y: monthlyItems[0].totalNetWorth > 0
        ? Number((((monthlyItems[11].totalNetWorth - monthlyItems[0].totalNetWorth) / monthlyItems[0].totalNetWorth) * 100).toFixed(1))
        : 0
    };
  },

  exportJSON() {
    const payload = {
      version: 6,
      exportedAt: new Date().toISOString(),
      state: this.state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `부부가계부_통합자산백업_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.state && Array.isArray(parsed.state.transactions)) {
        this.state = parsed.state;
        this.save();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
};

Storage.init();

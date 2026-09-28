import { describe, expect, test } from 'vitest'
import type { DailyTotal, PlaidAccount, PlaidItem, PlaidTransaction } from './api'
import { CATEGORIES } from './data'
import { addDays, parseISODate, toISODate } from './lib/dates'
import transferCases from '../server/tests/fixtures/transfer-cases.json'
import {
  avatarFor,
  buildCashFlow,
  buildLiveSummary,
  buildNetWorthHistory,
  categoryFor,
  formatMoney,
  groupByDay,
  initialsOf,
  isTransfer,
  mapAccountsToGroups,
  mapItemsToInstitutions,
  netWorthOf,
  signedAmount,
  toTransaction,
} from './plaidMapping'

const NOW = new Date(2026, 8, 28, 22, 30) // Sep 28, late evening local (already Sep 29 in UTC)

const account = (overrides: Partial<PlaidAccount> = {}): PlaidAccount => ({
  account_id: 'acc_checking',
  item_id: 'item_chase',
  name: 'Total Checking',
  official_name: null,
  mask: '1234',
  type: 'depository',
  subtype: 'checking',
  balances: { available: null, current: 1000, iso_currency_code: 'USD' },
  institution_name: 'Chase',
  balances_updated_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  stale: false,
  ...overrides,
})

const txn = (overrides: Partial<PlaidTransaction> = {}): PlaidTransaction => ({
  transaction_id: 't1',
  account_id: 'acc_checking',
  date: '2026-09-28',
  name: 'SQ *BLUE BOTTLE 1234',
  merchant_name: 'Blue Bottle',
  amount: '4.50',
  iso_currency_code: 'USD',
  personal_finance_category: 'FOOD_AND_DRINK',
  pending: false,
  account_name: 'Total Checking',
  institution_name: 'Chase',
  override_merchant_name: null,
  override_category: null,
  ...overrides,
})

const day = (date: string, net: number, income = 0, spending = 0): DailyTotal => ({ date, net, income, spending })

describe('names, avatars and money', () => {
  test('initials', () => {
    expect(initialsOf('Chase Bank')).toBe('CB')
    expect(initialsOf('  chase ')).toBe('CH')
    expect(initialsOf('X')).toBe('X')
    expect(initialsOf('   ')).toBe('··')
  })

  test('avatar colours are stable per name', () => {
    expect(avatarFor('Chase')).toEqual(avatarFor('Chase'))
    expect(avatarFor('Chase')).toHaveProperty('bg')
  })

  test('formatMoney', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(12, null)).toBe('$12.00')
    expect(formatMoney(12, 'EUR')).toBe('€12.00')
  })
})

describe('accounts', () => {
  const accounts = [
    account(),
    account({ account_id: 'acc_card', type: 'credit', subtype: 'credit card', mask: null, balances: { available: null, current: 250, iso_currency_code: 'USD' } }),
    account({ account_id: 'acc_ira', type: 'investment', subtype: null, institution_name: null, balances: { available: null, current: 5000, iso_currency_code: 'USD' } }),
    account({ account_id: 'acc_brk', type: 'brokerage', balances: { available: null, current: 500, iso_currency_code: 'USD' } }),
    account({ account_id: 'acc_mort', type: 'loan', balances: { available: null, current: 2000, iso_currency_code: 'USD' } }),
    account({ account_id: 'acc_house', type: 'other', balances: { available: null, current: null, iso_currency_code: 'USD' } }),
    account({ account_id: 'acc_odd', type: 'crypto', stale: true, balances_updated_at: null }),
  ]

  test('groups in a fixed order, with totals and display fields', () => {
    const groups = mapAccountsToGroups(accounts, NOW)

    expect(groups.map((g) => [g.id, g.total, g.accounts.length])).toEqual([
      ['cash', '$1,000.00', 1],
      ['credit', '$250.00', 1],
      ['invest', '$5,500.00', 2],
      ['property', '$1,000.00', 2], // 'other' and unknown types; a null balance counts as 0
      ['loans', '$2,000.00', 1],
    ])
    const [checking] = groups[0].accounts
    expect(checking).toMatchObject({
      id: 'acc_checking',
      name: 'Total Checking ·· 1234',
      institution: 'Chase · Checking',
      balance: '$1,000.00',
      updated: '5 min ago',
      stale: false,
    })
    expect(groups[1].accounts[0].name).toBe('Total Checking')
    expect(groups[2].accounts[0].institution).toBe('Connected · Investment')
    expect(groups[3].accounts[0].balance).toBe('—')
    expect(groups[3].accounts[1]).toMatchObject({ stale: true, updated: 'never' })
  })

  test('net worth subtracts what is owed', () => {
    // 1000 + 5000 + 500 + 0 + 1000 − 250 − 2000
    expect(netWorthOf(accounts)).toBe(5250)
  })

  test('summary splits assets and liabilities, skipping empty segments', () => {
    const summary = buildLiveSummary([
      account(),
      account({ type: 'credit', balances: { available: null, current: 250, iso_currency_code: 'USD' } }),
      account({ type: 'loan', balances: { available: null, current: null, iso_currency_code: 'USD' } }),
    ])

    expect(summary.netWorth).toBe('$750.00')
    expect(summary.assets.total).toBe('$1,000.00')
    expect(summary.assets.segments).toEqual([
      { label: 'Cash', width: '100.0%', color: expect.any(String), amount: '$1,000.00', percent: '100.0%' },
    ])
    expect(summary.liabilities.segments.map((s) => s.label)).toEqual(['Credit cards'])
  })

  test('the default clock is used when none is passed', () => {
    expect(mapAccountsToGroups([account({ balances_updated_at: new Date().toISOString() })])[0].accounts[0].updated).toBe('just now')
  })
})

describe('institutions', () => {
  test('one row per Plaid item, even at the same bank', () => {
    const items: PlaidItem[] = [
      { item_id: 'item_a', institution_name: 'Chase', institution_id: 'ins_3', status: 'ok', error_code: null, last_synced_at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() },
      { item_id: 'item_b', institution_name: 'Chase', institution_id: 'ins_3', status: 'login_required', error_code: 'ITEM_LOGIN_REQUIRED', last_synced_at: null },
      { item_id: 'item_c', institution_name: null, institution_id: null, status: 'error', error_code: 'INTERNAL_SERVER_ERROR', last_synced_at: null },
    ]
    const accounts = [account({ item_id: 'item_a' }), account({ item_id: 'item_a' }), account({ item_id: 'item_b' })]

    const rows = mapItemsToInstitutions(items, accounts, NOW)

    expect(rows.map((r) => [r.itemId, r.name, r.sub, r.status, r.lastSynced])).toEqual([
      ['item_a', 'Chase', '2 accounts · Plaid', 'ok', '2 hours ago'],
      ['item_b', 'Chase', '1 account · Plaid', 'login_required', 'never'],
      ['item_c', 'Connected bank', '0 accounts · Plaid', 'error', 'never'],
    ])
    expect(mapItemsToInstitutions([], [])).toEqual([])
  })
})

describe('categories and transfers', () => {
  test('an override wins, known or not', () => {
    expect(categoryFor('FOOD_AND_DRINK', 'Groceries')).toBe(CATEGORIES.groceries)
    expect(categoryFor('FOOD_AND_DRINK', 'Coffee')).toMatchObject({ name: 'Coffee', emoji: '🏷️' })
  })

  test("otherwise Plaid's category, falling back to Transfer", () => {
    expect(categoryFor('FOOD_AND_DRINK', null)).toBe(CATEGORIES.dining)
    expect(categoryFor('SOMETHING_NEW', null)).toBe(CATEGORIES.transfer)
    expect(categoryFor(null, null)).toBe(CATEGORIES.transfer)
  })

  // Shared with server/tests/db.test.js, which runs the same cases through
  // the SQL predicate behind "Include transfers" and the cash flow totals.
  test.each(transferCases)('isTransfer($pfc, $override) is $transfer, same as the server', ({ pfc, override, transfer }) => {
    expect(isTransfer(pfc, override)).toBe(transfer)
  })
})

describe('transactions', () => {
  test('flips Plaid signs, from strings (real pg NUMERIC) or numbers', () => {
    expect(signedAmount({ amount: '12.34' })).toBe(-12.34)
    expect(signedAmount({ amount: -500 })).toBe(500)
  })

  test('maps a plain transaction', () => {
    const t = toTransaction(txn())

    expect(t).toMatchObject({
      id: 't1',
      date: '2026-09-28',
      merchant: 'Blue Bottle',
      plaidMerchant: 'Blue Bottle',
      statementName: 'SQ *BLUE BOTTLE 1234',
      amountValue: -4.5,
      amount: '−$4.50',
      positive: false,
      category: CATEGORIES.dining,
      isTransfer: false,
      merchantEdited: false,
      categoryEdited: false,
      sub: 'Sep 28 · Dining out',
      initials: 'BB',
      account: { id: 'acc_checking', name: 'Total Checking', initials: 'TC' },
    })
  })

  test('edits win, and the subtitle shows the edited category', () => {
    const t = toTransaction(txn({ override_merchant_name: 'Coffee', override_category: 'Groceries' }))

    expect(t).toMatchObject({
      merchant: 'Coffee',
      plaidMerchant: 'Blue Bottle',
      category: CATEGORIES.groceries,
      merchantEdited: true,
      categoryEdited: true,
      sub: 'Sep 28 · Groceries',
    })
  })

  test('pending is a flag, never part of the name', () => {
    const t = toTransaction(txn({ pending: true }))
    expect(t.pending).toBe(true)
    expect(t.merchant).toBe('Blue Bottle')
  })

  test('fallbacks for missing merchant, account and currency', () => {
    const t = toTransaction(
      txn({ merchant_name: null, account_name: null, iso_currency_code: null, amount: -3000, date: '2026-09-15T00:00:00.000Z' }),
    )
    expect(t).toMatchObject({ merchant: 'SQ *BLUE BOTTLE 1234', amount: '+$3,000.00', positive: true, date: '2026-09-15' })
    expect(t.account.name).toBe('Chase')
    expect(toTransaction(txn({ account_name: null, institution_name: null })).account.name).toBe('Connected account')
  })

  test('groups by local day with a net per day', () => {
    const rows = [
      txn({ transaction_id: 'a', date: '2026-09-28', amount: '4.50' }),
      txn({ transaction_id: 'b', date: '2026-09-28', amount: '-10' }),
      txn({ transaction_id: 'c', date: '2026-09-27', amount: '20' }),
      txn({ transaction_id: 'd', date: '2026-09-20', amount: '0' }),
    ].map(toTransaction)

    const days = groupByDay(rows, NOW)

    expect(days.map((d) => [d.date, d.label, d.net, d.netPositive, d.transactions.length])).toEqual([
      ['2026-09-28', 'Today · Mon, Sep 28', '+$5.50', true, 2],
      ['2026-09-27', 'Yesterday · Sun, Sep 27', '−$20.00', false, 1],
      ['2026-09-20', 'Sun, Sep 20', '+$0.00', true, 1],
    ])
    expect(groupByDay([])).toEqual([])
  })
})

describe('cash flow', () => {
  test('sums only the current month', () => {
    const flow = buildCashFlow([day('2026-08-31', 0, 9999, 9999), day('2026-09-01', 0, 3000, 1000), day('2026-09-28', 0, 0, 500)], NOW)

    expect(flow).toEqual({
      month: 'September',
      income: '$3,000.00',
      spending: '$1,500.00',
      net: '+$1,500.00',
      netPositive: true,
      incomeWidth: '100%',
      spendingWidth: '50%',
    })
  })

  test('overspending and empty months', () => {
    expect(buildCashFlow([day('2026-09-02', 0, 100, 400)], NOW)).toMatchObject({
      net: '−$300.00',
      netPositive: false,
      incomeWidth: '25%',
      spendingWidth: '100%',
    })
    expect(buildCashFlow([], NOW)).toMatchObject({ incomeWidth: '0%', spendingWidth: '0%', net: '+$0.00' })
    expect(buildCashFlow([]).month).toBe(new Date().toLocaleDateString('en-US', { month: 'long' }))
  })
})

describe('net worth history', () => {
  const accounts = [account({ balances: { available: null, current: 1000, iso_currency_code: 'USD' } })]

  test('walks back from today using daily nets', () => {
    const history = buildNetWorthHistory(accounts, [day('2026-09-10', 200), day('2026-09-20', -50)], '1 month', NOW)
    const valueOn = (date: string) => history.points.find((p) => p.date === date)!.value

    expect(history.points[0].date).toBe('2026-08-28')
    expect(history.points.at(-1)).toEqual({ date: '2026-09-28', value: 1000 })
    // A day's net is applied at the end of that day.
    expect(valueOn('2026-09-20')).toBe(1000)
    expect(valueOn('2026-09-19')).toBe(1050)
    expect(valueOn('2026-09-10')).toBe(1050)
    expect(valueOn('2026-09-09')).toBe(850)
    expect(history).toMatchObject({
      current: 1000,
      change: '↑ $150.00',
      changePositive: true,
      changeLabel: '1 month change',
      plottable: true,
    })
  })

  test('a card payment between two connected accounts nets to zero', () => {
    // −100 on checking, +100 on the card: the server reports a net of 0.
    const history = buildNetWorthHistory(accounts, [day('2026-09-15', 0)], '1 month', NOW)
    expect(history.plottable).toBe(false)
    expect(history.change).toBe('↑ $0.00')
  })

  test('losses show as a fall', () => {
    expect(buildNetWorthHistory(accounts, [day('2026-09-15', -300)], '3 months', NOW)).toMatchObject({
      change: '↓ $300.00',
      changePositive: false,
      changeLabel: '3 months change',
    })
  })

  test('one point per calendar day, with none skipped at the DST change', () => {
    const history = buildNetWorthHistory(accounts, [], '1 month', new Date(2026, 2, 20, 12))
    const dates = history.points.map((p) => p.date)

    expect(dates).toContain('2026-03-08')
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBe(toISODate(addDays(parseISODate(dates[i - 1]), 1)))
    }
  })

  test.each([
    ['6 months', '2026-03-28'],
    ['1 year', '2025-09-28'],
    ['unknown', '2026-08-28'],
  ])('%s starts on %s', (range, start) => {
    expect(buildNetWorthHistory(accounts, [], range, NOW).points[0].date).toBe(start)
  })

  test('the default clock ends on today', () => {
    expect(buildNetWorthHistory(accounts, [], '1 month').points.at(-1)!.date).toBe(toISODate(new Date()))
  })
})

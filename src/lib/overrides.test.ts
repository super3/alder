import { describe, expect, test } from 'vitest'
import type { PlaidTransaction } from '../api'
import { applyPatch } from './overrides'

const txn: PlaidTransaction = {
  transaction_id: 't1',
  account_id: 'a1',
  date: '2026-09-28',
  name: 'SQ *BLUE BOTTLE 1234',
  merchant_name: 'Blue Bottle',
  amount: '4.50',
  iso_currency_code: 'USD',
  personal_finance_category: 'FOOD_AND_DRINK',
  pending: false,
  account_name: 'Checking',
  institution_name: 'Chase',
  override_merchant_name: 'Coffee',
  override_category: 'Groceries',
}

describe('applyPatch', () => {
  test('changing one field leaves the other edit alone', () => {
    expect(applyPatch(txn, { merchant_name: 'Blue Bottle Coffee' })).toMatchObject({
      override_merchant_name: 'Blue Bottle Coffee',
      override_category: 'Groceries',
    })
    expect(applyPatch(txn, { category: 'Dining out' })).toMatchObject({
      override_merchant_name: 'Coffee',
      override_category: 'Dining out',
    })
  })

  test('null resets just that field', () => {
    expect(applyPatch(txn, { category: null })).toMatchObject({
      override_merchant_name: 'Coffee',
      override_category: null,
    })
    expect(applyPatch(txn, { merchant_name: null })).toMatchObject({
      override_merchant_name: null,
      override_category: 'Groceries',
    })
  })

  test('does not mutate the original', () => {
    applyPatch(txn, { merchant_name: 'x', category: 'y' })
    expect(txn.override_merchant_name).toBe('Coffee')
  })
})

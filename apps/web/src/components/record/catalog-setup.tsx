'use client';

import * as c from '@journal/contracts';
import { Button } from '@journal/ui';
import { useRef, useState, type FormEvent } from 'react';
import { recordWrite, retainedCommand } from './record-api';
import { RecordField, RecordInput } from './record-fields';

type Currency = ReturnType<typeof c.currencyResponseSchema.parse>;
type Broker = ReturnType<typeof c.brokerResponseSchema.parse>;
export function CatalogSetup({
  prefix,
  currencies,
  brokers,
  onCreated,
}: {
  prefix: string;
  currencies: Currency[];
  brokers: Broker[];
  onCreated: () => Promise<unknown>;
}) {
  const [section, setSection] = useState('currency');
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const [values, setValues] = useState<Record<string, string>>({});
  const value = (key: string) => values[key] ?? '';
  const change = (key: string) => (next: string) =>
    setValues((previous) => ({ ...previous, [key]: next }));
  const input = (label: string, key: string, help?: string, required = true) => (
    <RecordInput
      label={label}
      value={value(key)}
      onChange={change(key)}
      required={required}
      {...(help ? { help } : {})}
    />
  );
  const select = (
    label: string,
    key: string,
    options: { value: string; label: string }[],
    required = true,
  ) => (
    <RecordField label={label}>
      {(id) => (
        <select
          id={id}
          value={value(key)}
          onChange={(event) => change(key)(event.target.value)}
          required={required}
        >
          <option value="">Choose…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </RecordField>
  );
  async function create(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    setSuccess('');
    let body: unknown;
    try {
      const effectiveAt = c.financialInstantSchema.parse(value('effectiveAt'));
      if (section === 'currency')
        body = c.currencyCreateSchema.parse({
          namespace: value('namespace'),
          code: value('code'),
          kind: value('kind'),
          unitIdentity: value('unitIdentity'),
          name: value('name'),
          displayScale: value('displayScale') === '' ? null : Number(value('displayScale')),
          settlementIncrement: value('settlementIncrement'),
          effectiveAt,
        });
      else if (section === 'account')
        body = c.accountCreateSchema.parse({
          name: value('name'),
          ...(value('brokerId') ? { brokerId: value('brokerId') } : {}),
          environment: value('environment'),
          accountType: value('accountType'),
          baseCurrencyId: value('currencyId'),
          inventoryMethod: value('inventoryMethod'),
          holdingMode: value('holdingMode'),
          allowShort: value('allowShort') === 'yes',
          effectiveAt,
        });
      else {
        const native = value('instrumentKind') !== 'manual';
        const family =
          value('instrumentKind') === 'share'
            ? 'stock'
            : value('instrumentKind') === 'etf'
              ? 'etf'
              : value('instrumentKind') === 'crypto'
                ? 'crypto_spot'
                : value('family');
        const subtype =
          value('instrumentKind') === 'share'
            ? 'ordinary-share'
            : value('instrumentKind') === 'etf'
              ? 'ordinary-etf'
              : value('instrumentKind') === 'crypto'
                ? 'non-rebasing-spot'
                : value('subtype');
        body = c.instrumentCreateSchema.parse({
          name: value('name'),
          family,
          subtype,
          economicIdentity: value('economicIdentity'),
          quantityUnit: native && family !== 'crypto_spot' ? 'share' : value('quantityUnit'),
          quoteCurrencyId: value('currencyId') || null,
          settlementCurrencyId: native
            ? value('currencyId') || null
            : value('settlementCurrencyId') || null,
          multiplier: native ? '1' : value('multiplier') || null,
          quantityIncrement: value('quantityIncrement') || null,
          priceIncrement: value('priceIncrement') || null,
          capability: native ? 'native-linear' : 'manual',
          effectiveAt,
          metadata: native
            ? {
                priceConvention: 'unit-price',
                settlementStyle: 'delivered',
                ...(family === 'crypto_spot' ? { rebasing: false } : {}),
              }
            : JSON.parse(value('metadata') || '{}'),
        });
        if (!value('instrumentKind'))
          throw new Error('Choose an instrument accounting capability.');
        if (native && value('confirmedConventions') !== 'yes')
          throw new Error('Confirm the native instrument conventions from your source.');
      }
    } catch (error) {
      setFailure(
        error instanceof c.ZodError
          ? error.issues
              .map((issue) => `${issue.path.join('.') || 'Record'}: ${issue.message}`)
              .join(' ')
          : error instanceof Error
            ? error.message
            : 'Check the reference values.',
      );
      return;
    }
    setBusy(true);
    try {
      const resource =
        section === 'currency' ? 'currencies' : section === 'account' ? 'accounts' : 'instruments';
      const id = retainedCommand(commands.current, section, body);
      if (section === 'currency')
        await recordWrite(`${prefix}/${resource}`, body, c.currencyResponseSchema, id);
      else if (section === 'account')
        await recordWrite(`${prefix}/${resource}`, body, c.accountResponseSchema, id);
      else await recordWrite(`${prefix}/${resource}`, body, c.instrumentResponseSchema, id);
      await onCreated();
      commands.current.delete(section);
      setSuccess(
        `${section === 'currency' ? 'Currency' : section === 'account' ? 'Account' : 'Instrument'} created. Select it in your trade.`,
      );
      setValues({});
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'The reference record could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }
  const currencyOptions = currencies.map((currency) => ({
    value: currency.id,
    label: `${currency.code} · ${currency.name}`,
  }));
  return (
    <details id="catalog-setup">
      <summary>Set up currencies, accounts and instruments</summary>
      <p>
        Create only source-verified reference data. These actions do not create deposits, starting
        capital or trades. Brokers can be left unassigned.
      </p>
      <form onSubmit={create}>
        <fieldset disabled={busy}>
          <RecordField label="Reference record">
            {(id) => (
              <select
                id={id}
                value={section}
                onChange={(event) => {
                  setSection(event.target.value);
                  setValues({});
                  setFailure(null);
                  setSuccess('');
                }}
              >
                <option value="currency">Currency</option>
                <option value="account">Account</option>
                <option value="instrument">Instrument</option>
              </select>
            )}
          </RecordField>
          <div className="record-fields">
            {input('Name', 'name')}
            {section === 'currency' && (
              <>
                {input(
                  'Currency namespace',
                  'namespace',
                  'For example, iso:4217 for a verified fiat currency or a chain namespace for a token.',
                )}
                {input('Currency code', 'code')}
                {select(
                  'Currency kind',
                  'kind',
                  ['fiat', 'digital', 'custom'].map((kind) => ({ value: kind, label: kind })),
                )}
                {input(
                  'Unit identity',
                  'unitIdentity',
                  'Include the chain and contract address when needed; a ticker alone is not an identity.',
                )}
                {input(
                  'Display decimal places',
                  'displayScale',
                  'An integer from 0 to 36. Display formatting does not round ledger values.',
                )}
                {input(
                  'Cash settlement increment',
                  'settlementIncrement',
                  'Source-verified decimal, for example 0.01 when the account settles in cents.',
                )}
              </>
            )}
            {section === 'account' && (
              <>
                {select('Account base currency', 'currencyId', currencyOptions)}
                {select(
                  'Broker (optional)',
                  'brokerId',
                  brokers.map((broker) => ({ value: broker.id, label: broker.name })),
                  false,
                )}
                {select('Account environment', 'environment', [
                  { value: 'paper', label: 'Paper' },
                  { value: 'live', label: 'Live' },
                ])}
                {select(
                  'Account type',
                  'accountType',
                  ['cash', 'margin', 'other'].map((type) => ({ value: type, label: type })),
                )}
                {select('Inventory policy', 'inventoryMethod', [
                  { value: 'fifo', label: 'FIFO' },
                  { value: 'average', label: 'Average cost' },
                  { value: 'specific', label: 'Specific lots (advanced recording required)' },
                ])}
                {select('Holding mode', 'holdingMode', [
                  { value: 'netted', label: 'Netted' },
                  { value: 'segregated', label: 'Segregated' },
                ])}
                {select('Allow supported short inventory', 'allowShort', [
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes — requires supported instrument conventions' },
                ])}
              </>
            )}
            {section === 'instrument' && (
              <>
                {select('Instrument accounting', 'instrumentKind', [
                  { value: 'share', label: 'Ordinary share · native delivered unit-price' },
                  { value: 'etf', label: 'Ordinary ETF · native delivered unit-price' },
                  {
                    value: 'crypto',
                    label: 'Non-rebasing spot crypto · native delivered unit-price',
                  },
                  { value: 'manual', label: 'Other instrument · source recording only' },
                ])}
                {input(
                  'Economic identity',
                  'economicIdentity',
                  'Use a stable source identity, including venue or contract terms where needed.',
                )}
                {select(
                  'Quote currency',
                  'currencyId',
                  currencyOptions,
                  value('instrumentKind') !== 'manual',
                )}
                {(value('instrumentKind') === 'crypto' || value('instrumentKind') === 'manual') &&
                  input('Quantity unit', 'quantityUnit')}
                {input(
                  'Quantity increment',
                  'quantityIncrement',
                  'Use the verified lot/fraction increment. Leave unknown manual conventions empty.',
                  value('instrumentKind') !== 'manual',
                )}
                {input(
                  'Price increment',
                  'priceIncrement',
                  'Use the verified price tick. Leave unknown manual conventions empty.',
                  value('instrumentKind') !== 'manual',
                )}
                {value('instrumentKind') === 'manual' && (
                  <>
                    {input('Instrument family', 'family')}
                    {input('Instrument subtype', 'subtype')}
                    {select('Settlement currency', 'settlementCurrencyId', currencyOptions, false)}
                    {input('Contract multiplier (if known)', 'multiplier', undefined, false)}
                    <RecordField
                      label="Source instrument metadata (JSON)"
                      help="Keep option, future or bond terms here. Manual recording does not enable their P&L, risk or valuation modules."
                    >
                      {(id, helpId) => (
                        <textarea
                          id={id}
                          aria-describedby={helpId}
                          value={value('metadata')}
                          onChange={(event) => change('metadata')(event.target.value)}
                          placeholder='{"priceConvention":"unit-price"}'
                        />
                      )}
                    </RecordField>
                  </>
                )}
              </>
            )}
            {input(
              'Conventions effective at (ISO time with offset)',
              'effectiveAt',
              'For example 2026-01-01T00:00:00Z. Choose the actual source effective date before the execution.',
            )}
          </div>
          {section === 'instrument' &&
            value('instrumentKind') &&
            value('instrumentKind') !== 'manual' && (
              <label className="record-check">
                <input
                  type="checkbox"
                  checked={value('confirmedConventions') === 'yes'}
                  onChange={(event) =>
                    change('confirmedConventions')(event.target.checked ? 'yes' : 'no')
                  }
                />
                I verified delivered settlement, unit-price quotation, multiplier 1 and the entered
                increments. Crypto is non-rebasing. Quote and settlement use the selected currency.
              </label>
            )}
          <Button type="submit">{busy ? 'Creating reference…' : `Create ${section}`}</Button>
        </fieldset>
      </form>
      {failure && <p role="alert">{failure}</p>}
      {success && <p role="status">{success}</p>}
    </details>
  );
}

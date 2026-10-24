'use client';

import { dashboardCatalogSchema, type DashboardCatalog } from '@journal/contracts';
import { CatalogPager, pinCatalogPage, type CatalogPage } from '../record/catalog-page';
import { recordRead } from '../record/record-api';

type Resource =
  | 'accounts'
  | 'brokers'
  | 'currencies'
  | 'portfolios'
  | 'strategies'
  | 'strategyVersions'
  | 'assets'
  | 'tags';
const resources: Array<[Resource, string]> = [
  ['accounts', 'accounts'],
  ['brokers', 'brokers'],
  ['currencies', 'reporting currencies'],
  ['portfolios', 'portfolio versions'],
  ['strategies', 'strategies'],
  ['strategyVersions', 'strategy versions'],
  ['assets', 'assets'],
  ['tags', 'tags'],
];
type Choice = { id: string; label: string };
export function mergeDashboardCatalogPage(
  current: DashboardCatalog,
  page: DashboardCatalog,
  resource: Resource,
  selected: readonly string[],
): DashboardCatalog {
  const text = resource === 'tags';
  const previous = text
    ? current.tags.map((id) => ({ id, label: id }))
    : (current[resource] as Choice[]);
  const next = text ? page.tags.map((id) => ({ id, label: id })) : (page[resource] as Choice[]);
  const items = pinCatalogPage(previous, next, selected);
  return dashboardCatalogSchema.parse({
    ...current,
    accountChoicesComplete: resource === 'accounts' ? false : current.accountChoicesComplete,
    [resource]: text ? items.map((item) => item.id) : items,
    pageCursors: { ...current.pageCursors, ...page.pageCursors },
  });
}
export function DashboardCatalogBrowser({
  prefix,
  catalog,
  onPage,
}: {
  prefix: string;
  catalog: DashboardCatalog;
  onPage: (resource: Resource, page: DashboardCatalog) => void;
}) {
  return (
    <details>
      <summary>Search and browse all filter choices</summary>
      <p>
        Load one bounded page at a time. Selected filters remain available while you browse other
        choices.
      </p>
      {resources.map(([resource, label]) => {
        const items =
          resource === 'tags'
            ? catalog.tags.map((id) => ({ id, label: id }))
            : (catalog[resource] as Choice[]);
        const load = async (url: string): Promise<CatalogPage<Choice>> => {
          const page = await recordRead(url, dashboardCatalogSchema);
          onPage(resource, page);
          return {
            items:
              resource === 'tags'
                ? page.tags.map((id) => ({ id, label: id }))
                : (page[resource] as Choice[]),
            nextCursor: page.pageCursors?.[resource] ?? null,
          };
        };
        return (
          <CatalogPager
            key={resource}
            label={label}
            endpoint={`${prefix}/catalog?resource=${resource}`}
            items={items}
            load={load}
            onPage={() => undefined}
          />
        );
      })}
    </details>
  );
}

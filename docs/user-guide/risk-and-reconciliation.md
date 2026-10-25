# Risk and reconciliation

Use **Risk & sizing** to publish explicit policies, capture point-in-time assessments and plan size. Use **Reconciliation** to compare independent dated statement evidence with recorded account cash, holdings and optional equity. Neither task posts a correcting financial amount automatically.

Reviewed **25 October 2026** against application commit `5132900a03efabaeb307787531546987228220e7` and Checkpoint 2 documentation commit `3c790c2326bfd38e93698c60e80102a3787d077e`. These workflows are **Source-reviewed**; retained Phase 18 test execution is historical. Fresh checkpoint checks belong in [manual verification](verification.md). See the [manual index](README.md), [feature inventory F16–F17](../feature-inventory.md), [glossary](../reference/glossary.md) and [financial concepts](../reference/financial-concepts.md).

## Access and prerequisites

Confirm the selected workspace before recording evidence. An owner/editor can publish risk policies, capture risk assessments, save statements, compare and accept matching statements. Viewers can read policy history, stored assessments, statements and comparison history, and use read-only sizing. The corresponding mutation controls are disabled or absent for viewers.

Create account/currency/instrument records first through [financial recording](financial-recording.md). Use their actual effective conventions and economic dates. Financial limits and optional statement equity need compatible dated prices/FX, cost coverage and account-capital evidence. Strategy policy assessment requires an explicit strategy version effective at the assessment instant; a strategy narrative alone does not configure evaluated restrictions. See [strategies](strategies.md).

> **Important:** Risk results inform decisions and never block truthful recording of an actual fill or breach. Sizing is a scenario, not an order, broker margin check or guaranteed loss. It does not create the immutable original plan/risk used for historical R; see [journaling and reviews](journaling-and-reviews.md).

## Publish an account or strategy risk policy

Open **Risk & sizing** (`/risk`) and choose **Policies & history**. Use this task when a restriction and its source assumptions must become an immutable, effective policy version.

1. Select **Start a new policy**, or **Edit as a new version** on an existing policy. Use **Load more policy history** for older records; **Retry policies** retries a failed history read.
2. Complete the policy fields below. A new policy selects exactly one account or strategy identity. A later version retains the policy's immutable scope; changing scope requires a new policy.
3. Expand **Add a typed restriction**. Select **Limit kind**, enter its applicable fields from the restriction table, then select **Add configured limit**. Repeat for each independent restriction. Inspect **Configured limits**, including the displayed exact definition. **Remove … limit** removes a draft limit before publication.
4. Review scope, effective instant, source order, freshness and all configured limits. Select **Publish policy version**. This action publishes directly; there is no separate confirmation dialog.
5. Wait for **Published … version …** and inspect the retained version in history. Editing publishes another version rather than modifying the original or old assessments.

| Policy field                                      | Meaning and validation                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Policy name**                                   | Required name, at most 160 characters.                                                                                                                                                     |
| **Policy scope**                                  | **Account** or **Strategy**. A strategy policy restricts the selected assessment account used for that strategy; it does not establish a separate strategy capital balance.                |
| **Policy scope reference**                        | Required existing identity. Use **Search policy scope reference** and **Load more policy scope reference** when needed.                                                                    |
| **Effective instant**                             | ISO timestamp with explicit offset. Assessments select the latest effective version of each applicable policy at their economic instant. Future-effective restrictions do not apply early. |
| **Change reason**                                 | Required reason, at most 2000 characters.                                                                                                                                                  |
| **Maximum observation age in milliseconds**       | Explicit nonnegative whole number. Missing/stale price or FX evidence makes affected results unknown. No freshness assumption is invented.                                                 |
| **Price source priority**, **FX source priority** | Comma-separated exact source names, highest first. Each list requires 1–32 unique names. These names must match recorded observation sources.                                              |

### Configure every restriction type

**Configured maximum** is a nonnegative exact decimal, except `positions` requires a nonnegative whole-number count (at most 1,000,000). Ratio values are fractions: `0.02` means 2%. For compatible maximum restrictions, equality is within the limit; an observed amount above the maximum breaches it. Consult [risk definitions](../risk.md) for the canonical measurement and sizing formulas.

| **Limit kind**  | Fields to enter and the population measured                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trade-risk`    | **Configured maximum**, **Limit currency**, **Risk measure**: **Monetary risk** or **Risk / complete positive account equity**. Uses an explicitly proposed risk amount, currency and method. Missing proposal risk is unknown, not zero.                                                             |
| `daily-loss`    | **Configured maximum**, **Limit currency**, **Period loss basis**, **Include actual period income** and **Policy calendar timezone**. Basis is **Complete account change excluding capital flows** or **Gross realizations plus realized FX less period-charged costs**. Uses the policy's local day. |
| `weekly-loss`   | The same fields as daily loss, with the policy timezone's Monday-starting week. Workspace display-timezone changes do not move an existing policy's calendar.                                                                                                                                         |
| `positions`     | **Configured maximum** only. Counts distinct nonzero actual holding books under the account convention, not journal campaigns. A proposal in an already held instrument does not create a second book count.                                                                                          |
| `concentration` | **Configured maximum** as an equity ratio, **Limit currency**, and optional **Concentration instrument ID (optional)**. Empty instrument ID evaluates the largest individual instrument's absolute monetary exposure divided by complete positive account equity.                                     |
| `exposure`      | **Configured maximum**, **Limit currency**, **Exposure measure**: **Gross absolute instrument exposure** or **Absolute net account exposure**; **Exposure denominator**: **Absolute monetary cap** or **Complete positive account equity**. Long/short signs affect the net measure.                  |
| `overnight`     | **Policy calendar timezone** and **Prohibited local boundary hour**, integer `0`–`23`. Evaluates remaining holdings or a proposal crossing that local hour. A proposed trade needs its intended exit. This is not an exchange holiday/session calendar.                                               |
| `prohibited`    | **Prohibited instrument IDs**, **Prohibited asset families**, **Prohibited instrument subtypes**: comma-separated exact identities/classifications. Instrument IDs are stable instrument identities, not metadata-version IDs. Each set permits at most 100 entries. Restrictions combine by union.   |

An empty limits list is allowed and invents no restriction. To retire one policy's restrictions prospectively, edit that policy, remove its limits and publish an empty replacement version at the intended effective instant. This does not remove other policies or their history. A policy permits at most 32 limits and a 64 KiB definition. Policy publication and risk assessment have their own immutable command history and do not post financial activity or advance its source revision.

The following independent fictional operands illustrate each restriction. They assume complete compatible evidence and the declared currency/population; they are not values supplied automatically by the form.

| Restriction    | Fictional configuration and evidence                                                                               | Expected result                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Per-trade risk | Monetary cap `100 USD`; proposal risk `150 USD`.                                                                   | `breached`.                                                                       |
| Daily loss     | UTC day, account-change basis, income included, cap `50 USD`; complete period loss `40 USD`.                       | `passed`. A deposit is excluded from the loss measure.                            |
| Weekly loss    | UTC Monday-starting week, realized-activity basis, income excluded, cap `100 USD`; complete period loss `120 USD`. | `breached`.                                                                       |
| Positions      | Cap `2`; two nonzero books and a proposal opening a third instrument.                                              | `breached`; a proposal in an already active instrument does not add another book. |
| Concentration  | Ratio cap `0.25`; largest absolute instrument exposure `300 USD` and complete positive equity `1000 USD`.          | `breached` at observed ratio `0.3`.                                               |
| Exposure       | Gross equity-ratio cap `2`; gross absolute exposure `1500 USD` and complete positive equity `1000 USD`.            | `passed` at observed ratio `1.5`.                                                 |
| Overnight      | Prohibited boundary `22` in `UTC`; a proposal plans to remain open from 21:00 until 23:00 that day.                | `breached`; omitting the intended exit leaves proposal evidence unknown.          |
| Prohibited     | The proposed instrument's stable identity is explicitly prohibited.                                                | `breached`, even if another applicable policy does not prohibit it.               |

**Fictional example:** create `Practice account cap` for a paper account, with **Effective instant** `2026-10-01T00:00:00Z`, reason `Synthetic review policy`, age `86400000`, and source priorities `manual`. Add `trade-risk`, maximum `100`, USD and **Monetary risk**, then publish. If a separate strategy policy permits `200 USD`, an assessment proposal at `150 USD` still breaches the account's `100 USD` restriction. [Risk unit tests](../../tests/unit/risk.test.ts) independently retain this precedence case. A looser strategy never removes an account breach.

Common mistakes are forgetting **Add configured limit** before publishing, entering `2` when intending 2%, using a version ID in the prohibited stable-instrument field, or changing the displayed timezone while expecting an old policy's calendar to change. The latest effective version of **every** applicable account and selected-strategy policy is evaluated; a later empty version retires only its own policy restrictions. Different currencies, measures and populations remain separate results rather than being compared as one number.

If publication conflicts because another editor published first, reload policy history and review the current version before editing again. If a risk response is interrupted or cannot be validated, keep the page and repeat the same action with unchanged fields; the UI retains the same command identity. Do not publish another command merely because the success response was lost. After navigation/reload, inspect history first.

## Capture a risk assessment

Choose **Assess risk** when current or historical account facts and an optional proposal must be recorded against effective policies. Capture requires owner/editor access; viewers can use a retained assessment link.

1. Select **Assessment account**, optional **Strategy version used**, and **Assessment instant**, an explicit-offset ISO timestamp at or before now. Search and **Load more …** controls retrieve paginated reference choices; **Retry references** retries failed lookups.
2. To assess an intended trade, check **Include a proposed trade** and complete the proposal fields below. Leave unchecked for account monitoring alone.
3. Select **Capture risk assessment**. Inspect **Assessment: …**, capture time, financial revision and calculation definition.
4. Read every restriction's state, explanation, **Observed** value/unit and **Policy and source evidence**. A known breach remains meaningful even if another restriction is unknown.
5. Retain **Permanent assessment record** for later authorized review. Later facts, observations and policy versions require a new assessment; the old record remains evidence for its captured context.

| Proposed-trade field                                                                | Meaning and validation                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proposed instrument version**                                                     | Required existing convention, effective at the assessment instant.                                                                              |
| **Proposed direction**                                                              | **Long** or **Short**.                                                                                                                          |
| **Proposed quantity**                                                               | Positive exact decimal in the instrument's quantity unit.                                                                                       |
| **Planned entry price**                                                             | Positive exact price when provided; required for a validated linear exposure estimate. Unsupported nonlinear exposure remains unknown.          |
| **Proposed initial risk**, **Proposed risk currency**, **Risk method and evidence** | Supply a positive amount, currency and method together, using a sizing result or reviewed scenario. They do not publish original campaign risk. |
| **Intended exit instant**                                                           | Explicit-offset ISO timestamp for evaluating a proposed overnight restriction. Missing required exit evidence remains unknown.                  |

| Result state   | What to do                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passed`       | All evaluated restrictions have sufficient compatible evidence and pass in the captured context. Reassess after relevant changes.                                                      |
| `breached`     | At least one established breach; it takes precedence over unknown results. Review the limit and source operands. Actual financial recording remains available.                         |
| `unknown`      | At least one result lacks sufficient evidence and no known breach establishes the overall breached state. Review its reason and supply valid evidence or adjust the proposed scenario. |
| `unconfigured` | No effective limits apply. Publish the intended restrictions before interpreting monitoring; this is not risk approval.                                                                |

**Fictional example:** with the account `100 USD` and strategy `200 USD` limits above, enter a proposal with **Proposed initial risk** `150`, USD and **Risk method and evidence** `Synthetic reviewed stop scenario`. Select the intended instrument, positive quantity and applicable effective strategy version. The account limit should be `breached`, the compatible strategy limit can be `passed`, and the overall assessment is `breached`. A per-trade limit without proposal risk instead remains `unknown`. An empty effective policy set is `unconfigured`.

Do not use a historical link as a live compliance badge. Original facts and policy snapshots remain pinned even if later recording changes an earlier economic date. Ratio limits require complete strictly positive equity; unsupported notional is not silently substituted for account equity or monetary exposure. Missing chronology, costs, boundary valuations, FX, quantity or eligibility can cause unknown. Fix the cited evidence and capture again; do not treat the result as a numeric zero.

Assessments permit at most 16 applicable policies, 200 holding books and a 1 MiB evidence/result budget. Oversized evidence produces a bounded rejection or explained unknown, never a partial pass. Consolidate redundant policies; an account outside supported calculation capacity requires further implementation rather than hiding actual holdings. This is synchronous monitoring; unattended real-time enforcement, broker margin and an advanced nonlinear scenario engine are unavailable.

## Plan a native linear trade size

Choose **Size a trade** for a read-only stop scenario. Viewers may use it. Native sizing is gated to validated ordinary shares, ordinary ETFs and supported non-rebasing spot instruments under the netted delivered convention. Shorts additionally require the account's short permission and the instrument's validated borrowed-delivery/carry-cost convention.

1. Select **Sizing account**, **Sizing instrument version**, **Sizing risk currency** and **Planning instant**. Use the actual instrument conventions effective at that instant.
2. Enter **Explicit risk budget** as a positive exact amount. Choose **Sizing method → Validated linear stop scenario** and **Sizing direction → Long** or **Short**.
3. Enter **Estimated fixed costs in risk currency** and **Estimated costs per quantity unit in risk currency**. Enter `0` explicitly if the scenario has no such estimated charge; neither field assumes it.
4. Enter **Maximum planning FX age in milliseconds** as a nonnegative whole number, **Entry price**, and **Adverse stop price**. The stop must be below entry for a long or above entry for a short. Both prices must be positive.
5. If quote and risk currencies differ, select **Planning FX observation (if currencies differ)**. The server checks pair direction, supersession, observation instant and age; no unspecified conversion rate is assumed.
6. Select **Calculate planned size**. Read **Sizing: …**, quantity, planned risk, budget, reasons and warning. Open **Calculation evidence** for method/version, risk per unit and source references.

The calculation rounds quantity down to a valid instrument increment using the [canonical planned-size formula](../risk.md#planned-size). No account capital, default percentage or minimum trade size is assumed. A budget unable to fund one positive increment can return quantity/risk zero without creating an order. Invalid increments, unknown conventions, stale FX, wrong-side stops, unsupported economics or representational overflow remain unknown/rejected rather than guessed.

**Fictional example:** for a validated USD share with multiplier `1` and quantity increment `1`, choose long entry `10`, adverse stop `9`, budget `100`, fixed costs `0` and per-unit costs `0`, all in USD. Expected quantity is `100` shares with planned risk `100 USD` for that scenario. No planning FX observation is needed because the currencies agree. This arithmetic assumes the reviewed conventions; it is not a guarantee that an actual exit fills at `9` or loses only `100`.

Common mistakes are entering the risk budget as a percentage, leaving estimated costs blank, using a favorable-side stop or interpreting a quantity as an order. Do not post a planning estimate as an actual expense merely because it appears in sizing; record actual source charges once. Copy the result into an explicit assessment proposal if you want retained policy evidence; sizing alone captures no risk assessment or original journal plan.

## Use an explicit manual scenario

Use **Explicit manual scenario risk** for complex or unsupported nonlinear products, or when reviewed source risk is the appropriate planning input. This preserves an explicitly manual amount without enabling native pricing or sizing.

1. In **Size a trade**, complete the same account, instrument, risk currency, planning instant, budget, direction, explicit cost and FX-age fields.
2. Choose **Sizing method → Explicit manual scenario risk**.
3. Enter **Manual initial risk including planned costs** and **Manual scenario quantity**, both positive exact decimals. Enter **Scenario or max-loss method and evidence** with the reviewed definition and source. Include all planned costs in the supplied total; the manual path retains that total instead of independently recomputing it from the linear cost fields.
4. Select **Calculate planned size** and inspect the visibly manual result and **Calculation evidence**. Supply its amount/currency/method explicitly in **Assess risk** if it should be included in policy assessment.

**Fictional example:** a manual contract's reviewed scenario gives quantity `2` and total initial risk including planned costs `150 USD`; the explicit budget is `100 USD`. Enter those values and a source method such as `Synthetic two-contract adverse settlement scenario including costs`. The result retains quantity `2` and risk `150`, with `manual_scenario_exceeds_budget`. It does not reduce the quantity automatically. This disclosure is not a passed policy assessment, stop guarantee, margin approval or historical R denominator.

Missing scenario risk, quantity or method leaves the manual scenario unknown. A source quantity by itself cannot establish nonlinear exposure, even if the manual risk amount is accepted for its declared purpose. Use [Supplied values](analytics-and-dashboard.md) for reviewed position/campaign accounting-analysis components; that is a different workflow from planning risk.

## Record an independent statement

Open **Reconciliation** (`/reconciliation`). Use this task to retain one account's independent snapshot at an exact UTC instant. A balanced Accounts **Reconciliation variance** only explains the application's own accounting identity; it cannot prove agreement with a broker statement.

> **Important:** Complete-section checkboxes declare omitted values to be independently stated zero. Check them only when the source covers the entire account population at that instant. Leaving them unchecked compares listed rows only; a match then covers only that declared scope.

1. As owner/editor, find **Record independent statement**. Choose **Account**, then fill the source/time fields below.
2. Under **Native cash balances**, select **Add cash balance** for each source currency. Enter **Cash currency 1**, **Statement cash 1** and **Cash tolerance 1**; subsequent rows increment the number. Use signed native amounts. Cash includes all economically owned settled, unsettled, restricted and collateral buckets. Use **Remove cash line …** to remove an incorrect draft row.
3. Check **Statement lists every cash currency; omitted currencies mean zero.** only when the entire cash population is covered.
4. Under **Native holding quantities**, select **Add holding quantity**. Fill **Instrument version 1**, **Statement quantity 1** and **Quantity tolerance 1** using signed net quantity in its stated units. The suggestion list supplies version IDs; enter a retained historical version ID directly when the current catalog differs. Use **Remove holding line …** to amend the draft.
5. Check **Statement lists every holding; omitted holdings mean zero.** only for complete holding coverage.
6. Optionally check **Compare statement equity** and enter **Equity currency**, **Statement equity** and **Equity tolerance**. Use the compatible owned-cash-plus-signed-holdings definition, including owned cash in transit. Buying power, margin or derivative notional is not interchangeable with equity.
7. Add optional evidence details, review every row and select **Save independent statement**. There is no separate review dialog. Wait for **Independent statement saved. Compare it with the ledger before accepting.**

| Source/evidence field          | Meaning and validation                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Statement time (UTC)**       | Snapshot time entered in UTC, even if workspace display time is different. Saved evidence is displayed in the workspace timezone.                   |
| **Statement source**           | Required source name, at most 160 characters.                                                                                                       |
| **Statement reference**        | Required retained document/evidence identifier, at most 500 characters.                                                                             |
| Cash/quantity/equity tolerance | Exact nonnegative absolute amount in that row's currency or quantity unit. Default `0`. It is not a percentage and does not alter the source value. |
| **Source SHA-256 (optional)**  | The original document's 64-character lowercase hexadecimal hash. Saving the text neither uploads nor authenticates the document.                    |
| **Statement notes**            | Optional source context, at most 4000 characters.                                                                                                   |

Each currency and instrument-version row must be unique. Provide at least one comparison or an explicitly complete zero scope. Statements accept at most 100 cash and 100 holding rows. The current UI reference dropdowns load at most 200 accounts/currencies/instruments without browse controls; a missing historical instrument version can be entered directly, but there is no direct account/currency ID-entry control here. The API and its [contract](../../packages/contracts/src/reconciliation.ts) remain the bounded alternative for callers with appropriate access; do not assume an absent dropdown choice does not exist.

Statements do not change inventory, cash or valuation. If one was entered incorrectly, preserve it and save a new accurately referenced statement explaining the correction in its notes. The UI provides no in-place statement edit or supersession action.

**Fictional example:** after `1000 USD` funding, a purchase of two shares at `10 USD` leaves `980 USD` cash and `2` shares. A compatible mark `12 USD` gives equity `1004 USD`. An independent synthetic statement instead lists cash `975`, quantity `3` and equity `1003`, all with tolerance `0`, at the same instant. Save exactly those independent values; do not copy the application totals into the statement merely to force agreement. [Reconciliation integration tests](../../tests/integration/reconciliation.test.ts) retain this disagreement fixture despite a zero internal bridge variance.

## Compare, review and accept a statement

1. In **Statement history**, choose **Review …** for the intended source. Use **Previous statements**/**Next statements** for 25-row pages, or **Retry history** after a failed read.
2. Check **Cash scope**, **Holdings scope** and **Preserved statement values**. Confirm account, source time, original values and tolerances before comparing.
3. If equity was included, enter **Price sources in priority order**, **FX sources in priority order** (comma-separated exact source names), and **Maximum observation age (hours)** (nonnegative). These policies value the statement instant; future observations cannot establish it.
4. Enter a required **Review note** (at most 2000 characters), then select **Compare with ledger**. The application appends a comparison at a pinned financial revision; it does not post the differences.
5. Review **Result**, **Compared financial revision**, **current financial revision**, review time/note and every row of **Independent statement versus ledger; variance is ledger minus statement**. Columns retain **Statement**, **Ledger**, **Variance**, **Tolerance**, and **Status and evidence**.
6. Investigate any variance or unavailable evidence. If recording is wrong, make a reviewed correction through [financial recording](financial-recording.md) or [accounts and portfolios](accounts-and-portfolios.md), then compare again. If the source uses incompatible definitions, obtain compatible evidence rather than altering its meaning.
7. When the displayed comparison is current, matched and not already accepted, select **Accept matching statement**. Acceptance appends evidence using that displayed comparison's financial revision and valuation policy. Wait for **Matching statement accepted at the recorded financial revision.**

| Comparison state | Meaning                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matched`        | Every compared row's absolute variance is within its exact tolerance. A matched listed-only scope does not prove omitted currencies/holdings were checked. |
| `variance`       | At least one comparison is outside tolerance. A known variance takes precedence if another row is unavailable. Acceptance is blocked.                      |
| `unavailable`    | Required evidence prevents a numeric comparison and no known variance establishes the overall variance state. Inspect reason codes; acceptance is blocked. |

In the fictional statement above, expected variances are cash `5 USD`, quantity `−1` share and equity `1 USD`; the result is `variance` and **Accept matching statement** is disabled. With a different independently justified cash source `979.99` against internal `980` and tolerance `0.01`, the exact variance `0.01` is retained and that row matches at the boundary. Choosing a tolerance is a source-review decision, not a repair to either amount.

Missing marks/FX, unsupported or incomplete quantity evidence and overflow remain unavailable. A complete section compares omitted internal currencies/holdings against zero with zero tolerance; an incomplete section compares only explicitly listed rows. A matched result can therefore be accepted for its declared listed-only scope; acceptance does not upgrade the scope to complete account reconciliation. Keep the scope disclosures with the accepted evidence. The [statement reconciliation reference](../statement-reconciliation.md) owns the comparison definitions.

## Inspect history, stale comparisons and interrupted responses

Use **Comparison history** under **Saved comparisons** to inspect previous immutable results, accepted status and stale labels. **Previous comparisons**/**Next comparisons** browse pages of up to 100. **Refresh comparison status** rechecks currentness and retries the selected comparison detail; if its refresh fails, refresh successfully before accepting evidence.

Any newer workspace financial command other than statement creation/assessment conservatively marks an earlier comparison stale. This can include another account's financial change or a catalog change. Historical acceptance and original values remain visible; a stale result is not current agreement. Select **Compare with ledger** again after review to append a fresh comparison. Old acceptance is not silently renewed. Read the compared/current revision numbers rather than assuming that a historically accepted label guarantees current agreement.

**Fictional example:** accept a wholly matched statement, then correct an erroneous historical fee. Refresh comparison status. The old comparison remains accepted as history and becomes stale; the new comparison must use the corrected financial revision and may show a variance until the independent evidence agrees.

After an interrupted statement save or comparison response, remain on the page and repeat the same action with unchanged inputs. The UI retains the command identity for an identical request; changing content starts a different request, and reloading loses in-memory retry state. Inspect statement/comparison history before recreating a command after navigation. Role/session errors require restored current access; reference-read errors call for the displayed retry or page refresh. Retrying an unknown mutation is not the same as assuming it failed.

The synchronous comparison supports accounts with at most 100 cash units and 100 holding books; requests are bounded to 128 KiB. An oversized scope fails explicitly. Narrowing the reporting interval does not reduce the account's snapshot population; use the supported scope/API boundary rather than hiding rows with false completeness declarations. No live broker connection, independent source authentication or automated correction is implied.

## Related tasks and evidence

Continue with [analytics and Dashboard](analytics-and-dashboard.md) to distinguish campaign drawdown, sampled account returns and reviewed supplied values; [accounts and portfolios](accounts-and-portfolios.md) for the internal account bridge; or the [guided example](guided-example.md) for connected synthetic tasks.

| Subject                                    | Reviewed source and retained acceptance coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy fields, versioning and combination  | [Risk UI](../../apps/web/src/components/risk/risk-workspace.tsx), [contracts](../../packages/contracts/src/risk.ts), [service](../../packages/server/src/risk/service.ts), [kernel](../../packages/domain/src/risk.ts), [unit tests](../../tests/unit/risk.test.ts), [integration](../../tests/integration/risk.test.ts), [UI tests](../../tests/ui/risk.test.tsx).                                                                                                                                      |
| Roles, reads, writes and retries           | [Risk API](../../packages/server/src/risk/api.ts), [risk request helper](../../apps/web/src/components/risk/risk-api.ts), [reconciliation API](../../packages/server/src/reconciliation/api.ts), [shared recording helper](../../apps/web/src/components/record/record-api.ts).                                                                                                                                                                                                                          |
| Independent statement scope and comparison | [Statement UI](../../apps/web/src/components/reconciliation/reconciliation-workspace.tsx), [contracts](../../packages/contracts/src/reconciliation.ts), [service](../../packages/server/src/reconciliation/service.ts), [contract tests](../../tests/unit/reconciliation-contracts.test.ts), [independent PostgreSQL tests](../../tests/integration/reconciliation.test.ts), [UI tests](../../tests/ui/reconciliation.test.tsx), [release browser workflows](../../tests/e2e/release-workflows.spec.ts). |

These are inspected implementation and retained historical coverage references, not a fresh execution claim or production-capacity certification. [FA-04 remains open](../final-audit.md); [manual verification](verification.md) records this checkpoint's separate checks.

# Settings and navigation

Use this guide to enter the application, choose the correct workspace, find a workflow and keep a private arrangement of filters and visible fields. Workspace settings affect everyone using that workspace; saved display views belong to your own membership.

**Source-reviewed:** 25 October 2026. Documentation baseline: Checkpoint 2 commit `3c790c2326bfd38e93698c60e80102a3787d077e`; application baseline: `5132900a03efabaeb307787531546987228220e7`. Behavior below is source-reviewed. Existing authentication, preferences, saved-view and browser tests have historical remediation evidence (H18); this page does not claim a new application test execution. See [manual verification](verification.md), [feature inventory](../feature-inventory.md) F01/F02/F20 and [getting-started verification](../getting-started/verification.md).

## Sign in and keep access to your work

You need an existing provisioned account and a reachable installation. Public self-registration is unavailable. Follow [first run](../getting-started/first-run.md) if an administrator has not yet created your initial owner account and workspace.

1. Open the installation's application address. If your session is absent, a protected page sends you to `/sign-in`.
2. On **Welcome back**, enter your provisioned address in **Email address** and your password in **Password**.
3. Select **Sign in** once and wait for **Overview**.
4. Check the workspace name before recording or restoring anything.

| Field or state                                                      | Meaning and validation                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Email address                                                       | A valid email address; the control accepts at most 320 characters. Use the identity provisioned for this installation.  |
| Password                                                            | Required, at most 128 characters on sign-in. This form checks an existing password; it is not a password creation form. |
| **Signing in…**                                                     | A request is in progress; the submit button prevents a second simultaneous submission.                                  |
| **Unable to sign in. Check your email and password and try again.** | The request failed. Recheck both fields; the form does not expose whether a particular account exists.                  |
| **Too many attempts. Please wait before trying again.**             | The server rejected the attempt because of rate limiting. Wait before retrying.                                         |
| **The connection failed. Please try again.**                        | The browser could not complete the request. Check connectivity and retry.                                               |

**Fictional example:** Mira enters `mira@example.test` and the privately provisioned password for a paper-only installation. Success opens Overview; it does not create demo trades or a new user.

Sessions expire after seven days in the reviewed configuration and do not silently renew their lifetime through ordinary activity. If a save says your session has ended, sign in again and check the persisted record before repeating a financial action whose result was uncertain. Some workflows retain a retry command only while their page remains open; navigating or reloading can lose that retry state.

The reviewed browser application exposes sign-in and sign-out. It has no account-profile editor, password-change/recovery screen, session-list/revocation screen, member-invitation screen or workspace role editor. Authentication contracts include additional protected API operations; their existence does not supply a browser control. Contact your installation administrator for access problems. Do not invent a new account to recover access to existing records.

Related: [installation](../getting-started/installation.md), [first run](../getting-started/first-run.md), [recording and uncertain results](financial-recording.md).

## Choose a workspace and understand roles

A workspace is the boundary around accounts, sources, journal entries and reports. Your authenticated user can have different roles in different workspaces. A broker, account or portfolio inside a workspace is not a separate workspace.

1. Open **Overview**.
2. If you belong to more than one workspace, choose the intended name in **Workspace**. The shared switcher returns to Overview for that workspace and clears cached workspace queries.
3. Check the name in the application sidebar. A demo workspace also displays **Demo workspace · Activity here is separate from real accounts.**
4. Open the next workflow using the application navigation. Its link carries the selected workspace identifier.

Dashboard also uses the shared Workspace switcher; other workflow screens can provide a local **Workspace** selector when more than one choice exists. Check the name after switching instead of relying on a previous screen's filters. A workspace selection is carried in the URL, such as `?workspace=<workspace-id>`; an unavailable or malformed selection does not grant access. Without an explicit selection, the application chooses an accessible non-demo workspace first, then the first available workspace. A bookmark without a workspace identifier should not be treated as a permanent selection.

| Role   | What it permits in the workflows covered here                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Viewer | Read accessible workspace records, download original import sources, create filtered exports and save your own private display preferences. Financial recording and imports are read-only. |
| Editor | Viewer capabilities plus supported financial/journal/strategy/import mutations. Workspace preferences and complete backup/restore still require owner access.                              |
| Owner  | Editor capabilities plus workspace timezone/reporting-currency preferences and complete portable backup/restore. Restoring creates a new workspace owned by the restoring user.            |

These are enforced permissions, not merely disabled buttons. The reviewed UI has no membership or role-management editor. If you see **No workspace has been assigned. Contact your workspace administrator to request access.**, an administrator must provision access; an empty list is not evidence that your financial data was deleted.

**Fictional example:** Mira has editor access to **Practice journal** and viewer access to **Research archive**. She can export selected records from Research archive and save her own journal list columns, but cannot stage a CSV there. Choosing Practice journal is necessary before posting her paper activity.

**Common mistakes:** recording in a demo workspace because its name resembles the live workspace; assuming owner status in one workspace carries to another; editing an account name to try to switch workspaces; expecting a portable archive to restore the old membership list.

Related: [accounts and portfolios](accounts-and-portfolios.md), [imports and exports](imports-and-exports.md), [glossary](../reference/glossary.md).

## Find the right page

The sidebar and the narrow-screen page navigation use the same destination labels. The active destination is marked as the current page. The application header shows your display name, the theme control and **Sign out**. The avatar is an initial, not a profile-menu button.

| Navigation label | Route              | Use it when you want to…                                                                                                                                       | Guide                                                 |
| ---------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Overview         | `/`                | Choose a review routine, switch workspaces or edit owner workspace preferences.                                                                                | This page                                             |
| Record trade     | `/record`          | Set up catalog records, record a supported fill or attribute an existing fill. **Advanced financial entry** opens the advanced mode on this recording surface. | [Financial recording](financial-recording.md)         |
| Trade journal    | `/journal`         | Find campaigns, publish plans, allocate fills and retain journal reviews/history.                                                                              | [Journaling and reviews](journaling-and-reviews.md)   |
| Imports          | `/imports`         | Map and stage CSV activity, validate groups, review duplicates/corrections and post explicitly.                                                                | [Imports and exports](imports-and-exports.md)         |
| Strategies       | `/strategies`      | Maintain playbooks, publish immutable versions and review assignments.                                                                                         | [Strategies](strategies.md)                           |
| Dashboard        | `/dashboard`       | Compare scoped campaign analytics, account curves and supporting records.                                                                                      | [Analytics and dashboard](analytics-and-dashboard.md) |
| Accounts         | `/accounts`        | Examine account/portfolio balances, value, flows and eligible return series.                                                                                   | [Accounts and portfolios](accounts-and-portfolios.md) |
| Risk & sizing    | `/risk`            | Publish risk policies, assess a scenario or size a supported candidate.                                                                                        | [Risk and reconciliation](risk-and-reconciliation.md) |
| Reconciliation   | `/reconciliation`  | Enter independent statement evidence and compare it with application records.                                                                                  | [Risk and reconciliation](risk-and-reconciliation.md) |
| Data & backups   | `/portability`     | Download a complete owner backup, restore separately or export selected records.                                                                               | [Imports and exports](imports-and-exports.md)         |
| Period reviews   | `/reviews`         | Create standalone period reviews and use their templates and linked-source summaries.                                                                          | [Journaling and reviews](journaling-and-reviews.md)   |
| Supplied values  | `/supplied-values` | Record and explicitly select supported reviewed supplied analysis components.                                                                                  | [Analytics and Dashboard](analytics-and-dashboard.md) |

Overview shortcuts have specific destinations: **Today's trades** opens the journal with today's period, **Review this week** opens its week filter, and **Manage strategies**, **Review accounts** and **Open analytics dashboard** open their corresponding surfaces. The weekly journal shortcut is a filtered trade list; use **Period reviews** for a standalone period-review document.

To move around, select a destination and confirm its heading and workspace. On a narrow screen, use the page navigation above the content. Keyboard users can follow **Skip to content** to the main area. Scrollable data tables can receive keyboard focus. Confirmation dialogs provide explicit confirm/cancel actions; use their visible labels and review the scope before confirming.

**Fictional example:** Mira chooses **Today's trades** on 25 October in a workspace set to `Europe/Madrid`. The journal uses that workspace's calendar day; it does not mean the UTC day or all imported rows dated 25 October in their source timezone.

**Common mistakes:** using Record trade to enter a purchase that was already imported; confusing the journal week's list with a saved period review; treating navigation to Dashboard as a live-price refresh. There is no separate `/settings` page in the reviewed application.

Related: [guided example](guided-example.md), [financial concepts](../reference/financial-concepts.md).

## Set workspace timezone and reporting currency

Use **Workspace preferences** on Overview before interpreting calendar-day reports. Only the owner sees editable controls; editors and viewers see the saved values.

1. Open **Overview** and verify the workspace.
2. Find **Workspace preferences**.
3. Enter **Timezone** and, optionally, **Reporting currency**.
4. Select **Save preferences** and wait for **Preferences saved.**
5. Reload Overview and check the values. Review existing report scopes when changing timezone or reporting preference.

| Field              | Definition and validation                                                                                                                                                                                                                | Fictional value   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Timezone           | A recognized IANA timezone, such as `UTC`, `Europe/Madrid` or `America/New_York`; not an arbitrary label or numeric offset. It controls workspace calendar boundaries and relevant displays. Existing source instants are not rewritten. | `Europe/Madrid`   |
| Reporting currency | An optional uppercase display/reporting label, 2–16 letters/digits beginning with a letter. Input is trimmed and uppercased. Blank saves no preference. This is a label rather than a currency catalog record.                           | `eur` saves `EUR` |

The reporting label does not create a currency, fund an account, convert cash or provide an FX observation. Report screens still select actual workspace currency identities and evidence policies. For example, a report may match the preference to an existing currency code; a duplicate code does not replace its identity/conventions. See [accounts and portfolios](accounts-and-portfolios.md).

Saving invalid timezone/currency input shows **Enter a valid timezone.** or **Enter a valid currency label.** and leaves the saved preferences unchanged. If another tab/user changed preferences first, the form displays **These preferences changed elsewhere. Reload them before saving again.** Select **Reload preferences**, inspect the current values, then reapply your intended change. Do not repeatedly submit a stale form. Session and connection errors are displayed separately; wait for the success message before assuming persistence.

**Expected result for the fictional values:** the workspace remembers `Europe/Madrid` and `EUR`. A UTC event near midnight can appear on the following Madrid calendar date. A 100 USD cash balance remains 100 USD until an actual conversion is posted; changing the reporting preference does not turn it into 100 EUR.

**Common mistakes:** entering `+02:00` instead of an IANA zone; assuming a preference authenticates a market feed; changing the timezone to disguise an incorrect event timestamp; expecting the setting to change the CSV source timezone. Imports have their own explicit source conventions.

Related: [import date conventions](imports-and-exports.md#choose-file-and-source-conventions), [financial recording](financial-recording.md), [financial concepts](../reference/financial-concepts.md).

## Choose a light or dark theme

Any signed-in role can change the appearance using the header's **Switch to dark theme** or **Switch to light theme** icon button. Select it once; its accessible label changes to the opposite action. No save button is needed.

The explicit choice is retained in this browser's local storage and shared by same-origin tabs through storage events. Without a saved choice, the control follows the device's light/dark preference. It is a browser preference, not a workspace financial setting or a portable archive item. Another browser or cleared site storage can have a different theme.

**Fictional example:** Mira chooses dark theme in the practice workspace. Switching to Research archive in the same browser keeps the dark appearance; the financial values do not change.

**Common mistakes:** looking for the theme under Workspace preferences; assuming a dark chart signals a different availability state; expecting the appearance choice to follow a portable restore into another browser.

Related: [navigation](#find-the-right-page), [manual verification](verification.md).

## Save private filters and visible columns

**Saved views and visible columns** appears on **Trade journal**, **Strategies** and **Dashboard**. Use it for a recurring list/report arrangement. Viewer, editor and owner memberships can each save their own preferences. Your preferences are isolated from other members, workspaces and the other two screens. They do not change shared records, financial calculations or other members' columns.

### Select visible fields

1. Open the intended screen in the correct workspace.
2. Expand **Saved views and visible columns** and wait until the controls finish loading.
3. Under **Visible list fields** (journal/strategies) or **Visible table columns** (Dashboard), select the fields you need.
4. Select **Save column preferences**.
5. Wait for **Saved your display preferences.** Reload the screen to confirm persistence.

| Screen                           | Always visible | Optional visible fields                                  |
| -------------------------------- | -------------- | -------------------------------------------------------- |
| Trade journal                    | **Trade**      | Status, Classification, Pinned strategy, Archived marker |
| Strategies                       | **Strategy**   | Status, Description, Version, Asset classes              |
| Dashboard supporting-trade table | **Trade**      | Status, Net P&L, Original R, Coverage                    |

Mandatory Trade/Strategy fields are disabled in the selector so a row keeps its identity. The controls select visibility, not arbitrary column ordering. Hiding Coverage does not make unavailable results complete. Named views and screen column preferences are separate: applying a saved view restores its filters; the screen's saved column selection remains in effect. Saving current filters also persists your current column selection.

**Fictional example:** Mira hides **Archived marker** in her journal, saves, then reloads. It stays hidden for her membership while another viewer retains their own selection. The archived state of every trade is unchanged.

**Common mistakes:** assuming a hidden field was deleted; expecting a named view to restore a different column set; hiding Coverage and interpreting unavailable P&L as zero; searching for these controls on Accounts, where they are not delivered.

Related: [journaling](journaling-and-reviews.md), [strategies](strategies.md), [analytics](analytics-and-dashboard.md).

### Save, apply, update and delete a named filter view

Set the screen's ordinary filters first. On Dashboard, select **Apply filters** before saving: named views capture the applied report settings, not unapplied edits in the report form.

1. Expand **Saved views and visible columns**.
2. Enter **Saved view name**, such as `Paper October review`.
3. Select **Save current filters as view** and wait for **Saved your display preferences.**
4. Change the screen filters to something else.
5. Choose the name in **Your saved journal view**, **Your saved strategies view** or **Your saved dashboard view**.
6. Select **Apply saved view**. Check **Applied saved view: Paper October review.** and the resulting filters.

To update a view, set the intended filters and save using its existing name. Names match without regard to case, so `Paper October review` and `paper october review` update one saved entry. Selecting an entry fills its name for convenience; saving a different name creates another entry and retains the original. To remove an entry, choose it and select **Delete selected saved view**, then wait for the save acknowledgement. Deleting a view removes that preference, not journal or financial records.

| Screen        | Filters retained by a named view                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trade journal | Find a trade text, Trade status, archived inclusion, Review period (`all`, today, week or custom), custom From/To dates and Account. Today/week remain relative periods interpreted when applied; they are not frozen historical intervals.                                                                                                                                                                                                                                  |
| Strategies    | Search strategies text, Filter by status and archived inclusion.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Dashboard     | Applied From/Through dates, reporting-currency identity, live/paper environment, maximum price/FX age, portfolio-version/account/broker/strategy/strategy-version/asset/asset-class/tag selections, explicitly selected supplied campaign results, supporting-trade search, performance/distributions/breakdowns tab and equity/performance curve choice. Source priority lists are derived from the report catalog and are not a frozen saved-view copy of a report result. |

Each screen accepts at most **20 views**, with trimmed names of **1–80 characters** and unique names ignoring case. Search text is bounded to 160 characters. Views retain explicit IDs; deleting access to an account or selecting a different catalog does not magically retarget those identities. Journal custom periods require both dates in increasing order. Dashboard dates must be valid, with From on/before Through and the ordinary report maximum period enforced when applied. See the screen guides for financial scope and freshness rules.

**Fictional example:** in Trade journal, Mira selects **Review period** This week, **Trade status** Open and her paper account, then saves `Weekly open paper`. Applying it next week uses next week's workspace calendar period. For a fixed October review, she saves a Custom range instead. On Dashboard she applies the October paper scope before saving a separately named Dashboard view.

**Expected result:** the saved entry survives a fresh client session for the same membership. Applying it changes screen filters and recalculates/loads the selected scope; it does not restore old calculation results or an old database revision. Saved views are excluded from portable workspace archives, so they must be recreated in a restored workspace.

**Common mistakes:** expecting the same name to be shared with a colleague; treating a view as a report export; assuming selecting a name alone applies it; expecting a selected existing view to be renamed by saving a new name; saving unapplied Dashboard form edits; expecting the view to freeze a relative week.

Related: [analytics and Dashboard](analytics-and-dashboard.md), [imports and exports](imports-and-exports.md), [journaling and reviews](journaling-and-reviews.md).

### Recover from a saved-preference error

If preferences cannot load, the controls remain disabled and **Saved display preferences could not load.** appears. Select **Reload saved preferences** after connectivity/access is restored. Ordinary screen records can still be read subject to their own loading state; a preference-load failure is not proof that financial history is missing.

If another tab saved first, the server rejects a stale revision. The page keeps your local column selection until you explicitly select **Reload saved preferences**. Note the choice you intended, reload current preferences, then reapply it without overwriting another change blindly.

If a save's result is unknown or its response was incomplete, the editor freezes further preference changes and offers **Retry retained preference save**. Select that action to resend the retained body. Wait for acknowledgement before editing. Do not reload merely to escape the lock: a reload loses the page's retained request and the first save may already have persisted.

**Fictional example:** Mira's connection drops after saving her journal columns. She selects **Retry retained preference save** on the same page; the matching saved settings are returned without creating another named view. If she already closed the page, she reloads preferences and inspects their current state before saving again.

Related: [manual verification](verification.md), [source saved-view service](../../packages/server/src/display-views/service.ts) (`write` revision and matching-retry behavior).

## Sign out after saving

1. Wait for acknowledgement of any save or financial action. Inspect uncertain financial results before abandoning their page.
2. Select **Sign out** in the application header.
3. If **Sign out with unsaved work?** appears, select **Cancel** to keep working or review the warning and select **Discard and sign out** to discard those unsaved edits and page retry state.
4. Confirm that **Welcome back** appears. If **Unable to sign out. Please try again.** appears, retry; do not assume the session ended.

Sign-out ends the authenticated application session and clears cached workspace queries in this client. Saved workspace records remain available on a later sign-in. Browser back navigation cannot replace authentication or workspace authorization.

**Fictional example:** Mira has saved her weekly journal review but has an uncommitted draft edit. Cancel keeps the draft open; **Discard and sign out** discards that edit while preserving the acknowledged review. A new sign-in should show the saved review, not the discarded draft.

Unsaved-work guards exist for the workflows that register them, including journal and strategy editing; do not assume every form stores drafts or intercepts every navigation. Save explicitly and check its acknowledgement before leaving.

Related: [journaling and reviews](journaling-and-reviews.md), [strategies](strategies.md), [financial recording](financial-recording.md).

## Source and verification references

The following files establish the reviewed behavior; historical test presence does not claim a fresh run or every-browser certification.

| Subject                            | Source and retained test coverage                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation and workspace selection | [Application shell](../../apps/web/src/components/application-shell.tsx) (`destinations`, `workspaceHref`), [workspace page loader](../../apps/web/src/lib/workspace-page.ts), [switcher](../../apps/web/src/components/workspace-switcher.tsx), [Overview](../../apps/web/src/app/page.tsx)                                                                                                              |
| Sign-in, session and sign-out      | [Sign-in form](../../apps/web/src/components/sign-in-form.tsx), [sign-out button](../../apps/web/src/components/sign-out-button.tsx), [authentication configuration](../../packages/server/src/auth.ts), [authentication integration tests](../../tests/integration/auth.test.ts), [scaffold browser tests](../../tests/e2e/scaffold.spec.ts)                                                             |
| Workspace preferences              | [Preferences UI](../../apps/web/src/components/workspace-preferences.tsx), [workspace contracts](../../packages/contracts/src/index.ts) (`workspacePreferencesUpdateSchema`), [preferences UI tests](../../tests/ui/workspace-preferences.test.tsx)                                                                                                                                                       |
| Theme                              | [Theme toggle](../../apps/web/src/components/theme-toggle.tsx)                                                                                                                                                                                                                                                                                                                                            |
| Private views and columns          | [Saved-view UI](../../apps/web/src/components/display-views/use-display-views.tsx), [contracts](../../packages/contracts/src/display-views.ts), [service](../../packages/server/src/display-views/service.ts), [API authorization](../../packages/server/src/display-views/api.ts), [UI tests](../../tests/ui/display-views.test.tsx), [integration tests](../../tests/integration/display-views.test.ts) |

See [manual index](README.md) for the rest of the user guide and [documentation standards](../documentation-standards.md) for evidence labels.

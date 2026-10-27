/**
 * Read-only documentation checks. Uses the repository's pinned Markdown parser;
 * it does not execute examples, fetch external links or certify financial claims.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdown from 'prettier/plugins/markdown';

const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .sort();
const manifest = JSON.parse(await readFile(root + 'package.json', 'utf8'));
const packageScripts = new Set(Object.keys(manifest.scripts));
const pnpmCommands = new Set(['install', 'exec', 'audit', 'add', 'remove', 'update', 'run']);
const historical = new Set([
  'Trading_Journal_Codex_Prompt.md',
  'docs/requirements-analysis.md',
  'docs/architecture.md',
  'docs/domain-model.md',
  'docs/financial-calculations.md',
  'docs/financial-fixtures.md',
  'docs/instrument-capabilities.md',
  'docs/phase-2-validation.md',
]);
const isPreserved = (name) => historical.has(name) || name.startsWith('docs/decisions/');
const documents = new Map();
const errors = [];
const warnings = [];
const riskOccurrences = [];
const secretOccurrences = [];
const commands = new Set();
const targets = new Set();
const sensitiveCommand =
  /\brm\s+-[^\n]*r[^\n]*f\b|\bdrop(?:db|\s+database|\s+schema|\s+table)\b|\btruncate\b|docker\s+(?:compose\s+down\s+[^\n]*-v|volume\s+rm)|pg_restore\b[^\n]*--clean\b|--insecure\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0|strict-ssl\s*=\s*false|chmod\s+777\b/i;
const counts = {
  documentCount: paths.length,
  parsed: 0,
  localLinks: 0,
  headingAnchors: 0,
  jsonExamples: 0,
  codeBlocks: 0,
  mermaidBlocks: 0,
  inlineSourcePaths: 0,
  prospectiveSourcePaths: 0,
};
function issue(list, file, line, code, message) {
  list.push({ file, line, code, message });
}
function walk(node, visitor) {
  visitor(node);
  for (const child of node.children ?? []) walk(child, visitor);
}
function textOf(node) {
  return node.value ?? node.alt ?? (node.children ?? []).map(textOf).join('');
}
function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replaceAll(' ', '-');
}
function anchorSet(ast, source) {
  const found = new Set();
  const repeats = new Map();
  walk(ast, (node) => {
    if (node.type !== 'heading') return;
    const base = slug(textOf(node));
    let count = repeats.get(base) ?? 0;
    let candidate = base + (count ? `-${count}` : '');
    while (found.has(candidate)) candidate = `${base}-${++count}`;
    repeats.set(base, count);
    found.add(candidate);
  });
  for (const match of source.matchAll(/<a\b[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']/gi))
    found.add(match[1]);
  return found;
}
async function exists(filename) {
  try {
    return await stat(filename);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

for (const file of paths) {
  const source = await readFile(root + file, 'utf8');
  let ast;
  try {
    ast = markdown.parsers.markdown.parse(source);
    counts.parsed++;
  } catch {
    issue(errors, file, 1, 'markdown-parse', 'The pinned Markdown parser rejected this file.');
    continue;
  }
  const lines = source.split('\n');
  const styleIssues = isPreserved(file) ? warnings : errors;
  if (!source.endsWith('\n') || source.includes('\r'))
    issue(styleIssues, file, 1, 'newlines', 'Expected LF and a final newline.');
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line))
      issue(styleIssues, file, index + 1, 'trailing-whitespace', 'Trailing whitespace.');
    // Recognizable credential prefixes only; never emit the suspected value.
    if (
      /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|sk-live-[A-Za-z0-9]{20,})\b/.test(
        line,
      )
    )
      issue(
        secretOccurrences,
        file,
        index + 1,
        'credential-prefix',
        'Possible credential; review privately.',
      );
  });
  const headings = [];
  const definitions = new Map();
  walk(ast, (node) => {
    if (node.type === 'definition') definitions.set(node.identifier.toLowerCase(), node);
    if (node.type === 'heading') headings.push(node);
    if (node.type === 'inlineCode' && sensitiveCommand.test(node.value))
      issue(
        riskOccurrences,
        file,
        node.position.start.line,
        'state-or-security-sensitive-command',
        'Review inline command/description scope and adjacent warning; this match is not a safety decision.',
      );
    if (node.type === 'code') {
      counts.codeBlocks++;
      const line = node.position.start.line;
      if (!node.lang)
        issue(styleIssues, file, line, 'fence-language', 'Code block has no language.');
      const fence = lines[line - 1].match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        const closing = lines[node.position.end.line - 1];
        const expected = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
        if (!expected.test(closing))
          issue(
            styleIssues,
            file,
            line,
            'unclosed-fence',
            'Fenced code has no matching closing fence.',
          );
      }
      if (node.lang === 'mermaid') counts.mermaidBlocks++;
      if (node.lang === 'json') {
        counts.jsonExamples++;
        try {
          JSON.parse(node.value);
        } catch {
          issue(errors, file, line, 'json-example', 'A JSON-labelled example is not valid JSON.');
        }
      }
      if (/^(?:bash|sh|shell|sql|powershell)$/i.test(node.lang ?? '')) {
        node.value.split('\n').forEach((value, index) => {
          if (sensitiveCommand.test(value))
            issue(
              riskOccurrences,
              file,
              line + index + 1,
              'state-or-security-sensitive-command',
              'Review scope, prerequisites and adjacent warning; this match is not a safety decision.',
            );
        });
      }
    }
  });
  if (headings.filter((node) => node.depth === 1).length !== 1)
    issue(styleIssues, file, 1, 'h1-count', 'Expected one H1.');
  for (let i = 1; i < headings.length; i++)
    if (headings[i].depth > headings[i - 1].depth + 1)
      issue(
        styleIssues,
        file,
        headings[i].position.start.line,
        'heading-depth',
        'Heading skips a level.',
      );
  for (const match of source.matchAll(/\bcorepack pnpm (?:--silent )?([A-Za-z0-9_:.-]+)/g)) {
    const command = match[1];
    commands.add(command);
    if (!command.startsWith('-') && !packageScripts.has(command) && !pnpmCommands.has(command))
      issue(
        errors,
        file,
        source.slice(0, match.index).split('\n').length,
        'package-command',
        'No matching root package script or recognized pnpm command.',
      );
  }
  documents.set(file, { source, ast, definitions, anchors: anchorSet(ast, source) });
}

for (const [file, document] of documents) {
  const links = [];
  const inline = [];
  walk(document.ast, (node) => {
    if (node.type === 'link' || node.type === 'image') links.push({ node, url: node.url });
    if (node.type === 'html')
      for (const match of node.value.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi))
        links.push({ node, url: match[1] });
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const definition = document.definitions.get(node.identifier.toLowerCase());
      if (definition) links.push({ node, url: definition.url });
      else
        issue(
          errors,
          file,
          node.position.start.line,
          'link-reference',
          'No matching reference definition.',
        );
    }
    if (node.type === 'inlineCode') inline.push(node);
  });
  for (const { node, url } of links) {
    if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/.test(url)) continue;
    counts.localLinks++;
    let destination;
    try {
      destination = decodeURIComponent(url);
    } catch {
      issue(errors, file, node.position.start.line, 'link-encoding', 'Invalid URL encoding.');
      continue;
    }
    const [pathname, fragment] = destination.split('#', 2);
    const withoutQuery = pathname.split('?', 1)[0];
    const absolute = withoutQuery.startsWith('/')
      ? path.resolve(root, '.' + withoutQuery)
      : path.resolve(root, path.dirname(file), withoutQuery || path.basename(file));
    const target = path.relative(root, absolute).split(path.sep).join('/');
    if (target.startsWith('../')) {
      issue(
        errors,
        file,
        node.position.start.line,
        'outside-repository',
        'Local link escapes the repository.',
      );
      continue;
    }
    targets.add(target);
    const info = await exists(absolute);
    if (!info) {
      issue(
        errors,
        file,
        node.position.start.line,
        'missing-link-target',
        `Missing local target: ${target}`,
      );
      continue;
    }
    if (fragment) {
      counts.headingAnchors++;
      if (/^L\d+(?:-L?\d+)?$/.test(fragment) && info.isFile()) continue;
      if (documents.has(target)) {
        if (!documents.get(target).anchors.has(fragment))
          issue(
            errors,
            file,
            node.position.start.line,
            'missing-heading-anchor',
            `Missing heading anchor in ${target}`,
          );
      } else if (target.endsWith('.json') && fragment.startsWith('/')) {
        try {
          let value = JSON.parse(await readFile(absolute, 'utf8'));
          for (const key of fragment.slice(1).split('/'))
            value = value[key.replaceAll('~1', '/').replaceAll('~0', '~')];
          if (value === undefined) throw new Error('Missing JSON pointer');
        } catch {
          issue(
            errors,
            file,
            node.position.start.line,
            'json-pointer',
            `Invalid JSON pointer in ${target}`,
          );
        }
      } else
        issue(
          warnings,
          file,
          node.position.start.line,
          'unverified-fragment',
          `Fragment not checked for non-Markdown target: ${target}`,
        );
    }
  }
  for (const node of inline) {
    if (
      !/^(?:apps|packages|scripts|tests)\/[A-Za-z0-9_./-]+\.(?:tsx?|mjs|json|sql|ya?ml)$/.test(
        node.value,
      )
    )
      continue;
    const line = node.position.start.line;
    const context = document.source
      .split('\n')
      .slice(Math.max(0, line - 3), line + 1)
      .join(' ');
    if (await exists(root + node.value)) {
      counts.inlineSourcePaths++;
    } else if (
      /\b(?:proposed|proposal|example path|for example|not (?:exist|deliver|implement)|no (?:root )?(?:script|file)|new (?:file|module)|create|add)\b/i.test(
        context,
      )
    ) {
      counts.prospectiveSourcePaths++;
    } else
      issue(
        errors,
        file,
        line,
        'missing-inline-source',
        'Referenced inline source path does not exist.',
      );
  }
}
for (const possible of secretOccurrences)
  issue(errors, possible.file, possible.line, possible.code, possible.message);
const result = {
  status: errors.length ? 'failed' : 'passed',
  scope:
    'All Git-visible Markdown, including preserved historical/design files; no external URL requests, command execution, formula certification or complete secret detection.',
  parser: 'Pinned prettier/plugins/markdown',
  ...counts,
  uniqueLocalTargets: targets.size,
  packageCommands: [...commands].sort(),
  errors,
  preservedStyleWarnings: warnings,
  suspectedCredentialLocations: secretOccurrences,
  commandsForSafetyReview: riskOccurrences,
  documents: paths,
};
await mkdir(root + 'work/phase-19-cp7', { recursive: true });
await writeFile(
  root + 'work/phase-19-cp7/documentation-checks.json',
  JSON.stringify(result, null, 2) + '\n',
);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exitCode = errors.length ? 1 : 0;

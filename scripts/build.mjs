import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeFiles = ['background.js', 'sidepanel.css', 'sidepanel.html', 'sidepanel.js', 'sync.js'];
const targets = {
  chromium: 'manifest.json',
  portable: 'manifests/portable.json',
  firefox: 'manifests/firefox.json',
  safari: 'manifests/safari.json',
};

async function readText(path) {
  return (await readFile(resolve(root, path), 'utf8')).replace(/\r\n/g, '\n');
}

function validateManifest(manifest, target) {
  const resources = [
    manifest.action?.default_popup,
    manifest.background?.service_worker,
    ...manifest.background?.scripts ?? [],
    manifest.side_panel?.default_path,
    manifest.sidebar_action?.default_panel,
    ...manifest.content_scripts.flatMap(script => [...script.js ?? [], ...script.css ?? []]),
  ].filter(Boolean);

  for (const resource of resources) {
    if (!runtimeFiles.includes(resource)) {
      throw new Error(`${target}: '${resource}' is not in the runtime file list`);
    }
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// The runtime files are small. Store their bytes directly, with fixed dates and
// order, so ZIPs are reproducible without a ZIP binary or npm dependencies.
function createZip(files) {
  const localRecords = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;

  for (const [filename, content] of files) {
    const name = Buffer.from(filename, 'ascii');
    const bytes = Buffer.from(content, 'utf8');
    const checksum = crc32(bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0021, 12); // 1980-01-01, the first DOS date
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, bytes);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    local.copy(entry, 6, 4, 28); // ZIP version, flags, date, checksum, sizes and name length
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, name);
    directorySize += entry.length + name.length;
    offset += local.length + name.length + bytes.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, ...directory, end]);
}

async function build(out) {
  const base = JSON.parse(await readText(targets.chromium));
  if (typeof base.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(base.version)) {
    throw new Error('manifest.json must have a valid numeric extension version');
  }

  const runtime = await Promise.all(runtimeFiles.map(async name => [name, await readText(name)]));
  const filenames = new Set(['manifest.json', ...runtimeFiles]);
  const variants = await Promise.all(Object.entries(targets).map(async ([target, path]) => {
    const manifest = { ...JSON.parse(await readText(path)), version: base.version };
    validateManifest(manifest, target);
    return { target, files: [['manifest.json', JSON.stringify(manifest, null, 2) + '\n'], ...runtime] };
  }));

  for (const { target, files } of variants) {
    const directory = resolve(out, target);
    await mkdir(directory, { recursive: true });
    const existing = await readdir(directory, { withFileTypes: true });
    if (existing.some(entry => !entry.isFile() || !filenames.has(entry.name))) {
      throw new Error(`Unexpected files in ${directory}. Build to a clean folder with --out.`);
    }
    await Promise.all(files.map(([filename, content]) => writeFile(resolve(directory, filename), content)));
    const archive = resolve(out, `Digii-Deadlines-${target}-v${base.version}.zip`);
    await writeFile(archive, createZip(files));
    console.log(archive);
  }
}

try {
  const { values } = parseArgs({ options: { out: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: node scripts/build.mjs [--out <directory>] (default: dist)');
  } else {
    await build(resolve(root, values.out ?? 'dist'));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

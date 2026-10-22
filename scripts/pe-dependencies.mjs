// PE import-table audit. No execution, shell, PATH lookup, or developer-installed VC runtime.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function peImports(file) {
  const bytes = readFileSync(file);
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('Invalid PE executable');
  const machine = bytes.readUInt16LE(pe + 4);
  if (machine !== 0x8664) throw new Error('Expected Windows x86_64 executable/dependency');
  const optional = pe + 24;
  if (bytes.readUInt16LE(optional) !== 0x20b) throw new Error('Expected PE32+');
  const sectionStart = optional + bytes.readUInt16LE(pe + 20);
  const sections = Array.from(
    { length: bytes.readUInt16LE(pe + 6) },
    (_, i) => sectionStart + i * 40,
  );
  const offset = (rva) => {
    const section = sections.find(
      (s) =>
        rva >= bytes.readUInt32LE(s + 12) &&
        rva <
          bytes.readUInt32LE(s + 12) +
            Math.max(bytes.readUInt32LE(s + 8), bytes.readUInt32LE(s + 16)),
    );
    if (section === undefined) throw new Error('Invalid import RVA');
    return bytes.readUInt32LE(section + 20) + rva - bytes.readUInt32LE(section + 12);
  };
  const string = (rva) => {
    const start = offset(rva),
      end = bytes.indexOf(0, start);
    if (end < start || end - start > 256) throw new Error('Invalid import name');
    const name = bytes.toString('ascii', start, end).toLowerCase();
    if (!/^[a-z0-9_.-]+\.dll$/.test(name)) throw new Error('Unsafe import name');
    return name;
  };
  const imports = [];
  for (const [directory, stride, nameField, delayed] of [
    [1, 20, 12, false],
    [13, 32, 4, true],
  ]) {
    const rva = bytes.readUInt32LE(optional + 112 + directory * 8);
    if (!rva) continue;
    let at = offset(rva);
    for (let count = 0; count < 2048; count++, at += stride) {
      const name = bytes.readUInt32LE(at + nameField);
      if (!name) break;
      if (delayed && !(bytes.readUInt32LE(at) & 1))
        throw new Error('Unsupported VA-based delay import');
      imports.push(string(name));
      if (count === 2047) throw new Error('Import table limit exceeded');
    }
  }
  return [...new Set(imports)];
}
const system =
  /^(api-ms-win-|ext-ms-win-)|^(kernel32|kernelbase|ntdll|advapi32|user32|gdi32|gdi32full|shell32|shlwapi|ole32|oleaut32|combase|comdlg32|rpcrt4|ws2_32|bcrypt|crypt32|secur32|normaliz|winmm|version|setupapi|winspool\.drv|psapi|msvcrt|ucrtbase|imm32|iphlpapi|dnsapi|winhttp|userenv|wtsapi32|dbghelp|dwmapi|propsys|cfgmgr32|powrprof)\.dll$/;
export function auditWindowsBinary(file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const imports = peImports(file);
  for (const name of imports) {
    if (system.test(name)) continue;
    const dependency = path.join(path.dirname(file), name);
    if (!existsSync(dependency)) throw new Error(`Unbundled Windows runtime dependency: ${name}`);
    auditWindowsBinary(dependency, seen);
  }
  return imports;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.info(
    JSON.stringify(
      { architecture: 'x86_64', dependencies: auditWindowsBinary(path.resolve(process.argv[2])) },
      null,
      2,
    ),
  );
}

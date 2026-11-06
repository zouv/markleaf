import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 契约测试：不启动 Tauri / 浏览器，只校验会悄悄漂移的配置与 IPC 契约。
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const conf = readJson('src-tauri/tauri.conf.json');
const pkg = readJson('package.json');

test('identifier：反向域名形式，且不是 Tauri 默认值', () => {
  assert.match(conf.identifier, /^[A-Za-z0-9.-]+$/);
  assert.ok(conf.identifier.includes('.'), 'identifier 必须包含点（反向域名）');
  assert.notEqual(conf.identifier, 'com.tauri.dev');
});

test('版本号只在 Cargo.toml：tauri.conf.json 不写 version', () => {
  assert.equal(conf.version, undefined);
  assert.match(read('src-tauri/Cargo.toml'), /^version = "\d+\.\d+\.\d+"/m);
});

test('生产 CSP：禁止 unsafe-eval / 脚本 unsafe-inline，并放行 IPC', () => {
  const csp = conf.app?.security?.csp;
  assert.equal(typeof csp, 'string');
  assert.ok(!csp.includes('unsafe-eval'), '生产 CSP 不允许 unsafe-eval');
  const scriptSrc = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('script-src'));
  assert.ok(scriptSrc, 'CSP 必须显式声明 script-src');
  assert.ok(!scriptSrc.includes('unsafe-inline'), '生产 script-src 不允许 unsafe-inline');
  assert.ok(csp.includes('ipc:') && csp.includes('http://ipc.localhost'), 'CSP 必须放行 Tauri IPC');
});

test('开发 CSP 只放宽 Vite / HMR，仍然禁止 unsafe-eval', () => {
  const dev = conf.app?.security?.devCsp;
  assert.equal(typeof dev, 'string');
  assert.ok(!dev.includes('unsafe-eval'));
});

test('capabilities：窗口名正确，默认只含 core 权限', () => {
  const cap = readJson('src-tauri/capabilities/default.json');
  assert.deepEqual(cap.windows, ['main']);
  for (const permission of cap.permissions) {
    assert.match(permission, /^core:/, `新增非 core 权限前先评审：${permission}`);
  }
});

test('构建链路：devUrl / beforeDevCommand / frontendDist 与 Vite 一致', () => {
  assert.equal(conf.build.beforeDevCommand, 'npm run web:dev');
  assert.equal(conf.build.beforeBuildCommand, 'npm run web:build');
  assert.equal(conf.build.frontendDist, '../dist');
  assert.equal(new URL(conf.build.devUrl).protocol, 'http:');
  const vite = read('vite.config.ts');
  assert.match(vite, /tauri\.conf\.json/);
  assert.match(vite, /build\.devUrl/, 'vite.config.ts 必须从 tauri.conf.json 的 build.devUrl 读取端口');
  assert.ok(!vite.includes('1420'), '端口不应在 vite.config.ts 里再写一份');
});

test('IPC 契约：commands.rs 定义 = lib.rs 注册 = src/api.ts 调用', () => {
  const rust = read('src-tauri/src/commands.rs');
  const lib = read('src-tauri/src/lib.rs');
  const api = read('src/api.ts');

  const defined = new Set(
    [...rust.matchAll(/#\[tauri::command\][\s\S]*?pub (?:async )?fn (\w+)/g)].map((match) => match[1]),
  );
  const handler = lib.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? '';
  const registered = new Set(
    handler
      .split(',')
      .map((name) => name.trim().replace(/^commands::/, ''))
      .filter(Boolean),
  );
  const invoked = new Set([...api.matchAll(/invoke<[^>]+>\('([^']+)'(?:,|\))/g)].map((match) => match[1]));

  assert.deepEqual([...defined].sort(), [...registered].sort(), 'commands.rs 里的命令必须全部在 lib.rs 注册');
  assert.deepEqual([...invoked].sort(), [...defined].sort(), 'src/api.ts 调用的命令必须与 Rust 命令一致');
});

test('默认不引入 Tauri 插件（需要时先评审权限与攻击面）', () => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(deps)) {
    assert.ok(!name.startsWith('@tauri-apps/plugin-'), `模板默认不引入插件：${name}`);
  }
});

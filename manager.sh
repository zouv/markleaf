#!/usr/bin/env bash
# =============================================================================
# manager.sh — markleaf 项目统一管理脚本（本项目所有命令的唯一来源）
# 用法：./manager.sh <command> [args]    (Windows: sh manager.sh <command>，在 Git Bash 里)
#
# 前端在项目根（React + Vite），Rust / Tauri 后端在 src-tauri/。
# 版本号只在 src-tauri/Cargo.toml；开发端口只在 src-tauri/tauri.conf.json 的 build.devUrl。
# 新增或修改命令时，同步 README 的命令表与 AGENTS.md §4（sh check-docs.sh 会核对 help 与 README 是否一致）。
# =============================================================================
# 被 `sh manager.sh` 调起且 sh 不是 bash（如 Debian 的 dash）时，自动改用 bash 重跑。
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="${PROJECT_ROOT}/.runtime"
CARGO_MANIFEST="${PROJECT_ROOT}/src-tauri/Cargo.toml"
cd "${PROJECT_ROOT}"   # 从任何目录调用都在项目根执行

log()  { printf "\033[1;34m[manager]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ ok  ]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn ]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[err  ]\033[0m %s\n" "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "缺少命令：$1${2:+（$2）}"; exit 1; }
}

ensure_deps() {
  [ -d "${PROJECT_ROOT}/node_modules" ] || { err "前端依赖未安装：先 sh manager.sh setup"; exit 1; }
}

require_node_runtime() {
  require_cmd node; require_cmd npm
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (!((a===20&&b>=19)||(a===22&&b>=12)||a>22)) process.exit(1)' \
    || { err "Node.js 版本过低或不受 Vite 支持：需要 20.19+ 或 22.12+（当前 $(node --version)）"; exit 1; }
}
require_node() { require_node_runtime; ensure_deps; }
require_rust() { require_cmd cargo "安装 Rust：https://rustup.rs"; require_cmd rustc; }

# --------------------------------------------------------------------------- #
# 安装 / 开发 / 构建 / 测试
# --------------------------------------------------------------------------- #

cmd_setup() {
  require_node_runtime
  require_cmd cargo "安装 Rust：https://rustup.rs"
  log "安装前端依赖"
  if [ -f "${PROJECT_ROOT}/package-lock.json" ]; then npm ci --no-audit --no-fund
  else npm install --no-audit --no-fund; fi
  ok "安装完成：sh manager.sh dev 启动桌面开发模式"
}

cmd_dev() {
  require_node; require_rust
  log "tauri dev：Vite + Rust（Ctrl-C 退出）"
  npm run desktop:dev "$@"
}

cmd_web() {
  require_node
  log "只启动 Vite（浏览器预览；IPC 不可用）"
  npm run web:dev "$@"
}

cmd_build() {
  require_node
  log "构建前端（tsc --noEmit + vite build，产物 dist/）"
  npm run web:build
  ok "前端已构建：dist/"
}

# 全部跑完再汇总：某一项失败时其余照样执行，日志里不会把「没跑」误当成「通过」。
cmd_test() {
  require_node; require_rust
  local failed=""
  log "tsc --noEmit";  npm run typecheck || failed="${failed} typecheck"
  log "node:test";     npm test          || failed="${failed} node-test"
  log "cargo test";    cargo test --manifest-path "${CARGO_MANIFEST}" || failed="${failed} cargo-test"
  if [ -n "${failed}" ]; then
    err "未通过：${failed# }（各项都已跑完，见上方各自输出）"
    exit 1
  fi
  ok "tsc / node:test / cargo test 全部通过"
}

cmd_check() {
  require_node; require_rust
  local failed=""
  log "cargo fmt --check"; cargo fmt --manifest-path "${CARGO_MANIFEST}" --all -- --check || failed="${failed} cargo-fmt"
  log "cargo clippy";      cargo clippy --manifest-path "${CARGO_MANIFEST}" --all-targets -- -D warnings || failed="${failed} cargo-clippy"
  log "tsc --noEmit";      npm run typecheck || failed="${failed} typecheck"
  if [ -n "${failed}" ]; then
    err "未通过：${failed# }（各项都已跑完，见上方各自输出）"
    exit 1
  fi
  ok "cargo fmt / clippy / tsc 全部通过"
}

cmd_package() {
  require_node; require_rust
  log "tauri build（首次会下载依赖并编译，较慢）"
  npm run desktop:build
  mkdir -p "${PROJECT_ROOT}/dist"
  local n=0 f d
  while IFS= read -r f; do cp "${f}" "${PROJECT_ROOT}/dist/"; n=$((n + 1)); done < <(
    find "${PROJECT_ROOT}/src-tauri/target/release/bundle" -maxdepth 4 -type f \
      \( -name '*.msi' -o -name '*.exe' -o -name '*.dmg' -o -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) 2>/dev/null || true
  )
  while IFS= read -r d; do cp -R "${d}" "${PROJECT_ROOT}/dist/"; n=$((n + 1)); done < <(
    find "${PROJECT_ROOT}/src-tauri/target/release/bundle" -maxdepth 4 -type d -name '*.app' 2>/dev/null || true
  )
  if [ "${n}" -eq 0 ]; then
    warn "没找到安装包（见 src-tauri/target/release/bundle/）"
  else
    ok "已复制 ${n} 个产物到 dist/"
    ls -lh "${PROJECT_ROOT}/dist" | sed 's/^/    /'
  fi
}

# --------------------------------------------------------------------------- #
# 杂项
# --------------------------------------------------------------------------- #

cmd_check_docs() {
  sh "${PROJECT_ROOT}/check-docs.sh"
}

cmd_clean() {
  log "清理 dist/、src-tauri/target/、src-tauri/gen/schemas/、.runtime/"
  rm -rf "${PROJECT_ROOT}/dist" "${PROJECT_ROOT}/src-tauri/target" \
         "${PROJECT_ROOT}/src-tauri/gen/schemas" "${RUNTIME_DIR}"
  if [ "${1:-}" = "--all" ]; then
    log "同时清理 node_modules/"
    rm -rf "${PROJECT_ROOT}/node_modules"
  fi
  ok "已清理；要重建依赖用 sh manager.sh setup"
}

cmd_help() {
  cat <<EOF
markleaf — manager.sh（本项目所有命令的唯一来源）

用法：
  ./manager.sh <command> [args]    (Windows: sh manager.sh <command>)

命令：
  setup        首次安装前端依赖（npm ci；没有锁文件时 npm install）
  dev          开发模式：tauri dev（Vite + Rust，热更新）
  web          仅启动 Vite 预览前端（浏览器里，IPC 不可用）
  build        构建前端到 dist/（tsc --noEmit + vite build）
  test         跑 tsc + node 契约测试 + cargo test（全部跑完再汇总）
  check        cargo fmt --check + cargo clippy -D warnings + tsc
  package      tauri build 并复制安装包到 dist/（首次很慢）
  clean        清理 dist/、src-tauri/target、.runtime（--all 连 node_modules）
  check-docs   文档体系机械体检（同 sh check-docs.sh）
  help         显示本帮助
EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "${cmd}" in
    setup)      cmd_setup      "$@" ;;
    dev)        cmd_dev        "$@" ;;
    web)        cmd_web        "$@" ;;
    build)      cmd_build      "$@" ;;
    test)       cmd_test       "$@" ;;
    check)      cmd_check      "$@" ;;
    package)    cmd_package    "$@" ;;
    clean)      cmd_clean      "$@" ;;
    check-docs) cmd_check_docs "$@" ;;
    help|-h|--help) cmd_help ;;
    *) err "未知命令：${cmd}"; cmd_help; exit 2 ;;
  esac
}

main "$@"

@echo off
setlocal
pushd "%~dp0"
if not exist node_modules (
  call pnpm install || exit /b 1
)
call pnpm dev
popd

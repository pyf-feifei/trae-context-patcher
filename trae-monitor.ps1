$ErrorActionPreference = "SilentlyContinue"
$logRoot = Join-Path $env:APPDATA "Trae\logs"
$out = Join-Path "C:\Apps\a-tools\trae-context-patcher" "trae-monitor.log"
$patterns = "gpt-5\.4|GPT-5\.4|custom_model|customModel|is_custom_model|model_source|context_window|contextWindow|prompt_max|max_context|ChatStreamFrontResponseReporter|code_comp_trigger|code_comp_complete"
$seen = @{}
"=== Trae monitor started $(Get-Date -Format o) ===" | Out-File -FilePath $out -Encoding utf8 -Append
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
  Get-ChildItem -Path $logRoot -Recurse -File -Include *.log 2>$null |
    Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-20) } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 80 |
    ForEach-Object {
      $file = $_.FullName
      Get-Content -Path $file -Tail 120 2>$null |
        Select-String -Pattern $patterns |
        ForEach-Object {
          $line = "[$file] $($_.Line)"
          $key = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($line))
          if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $line | Out-File -FilePath $out -Encoding utf8 -Append
          }
        }
    }
  Start-Sleep -Seconds 2
}
"=== Trae monitor stopped $(Get-Date -Format o) ===" | Out-File -FilePath $out -Encoding utf8 -Append

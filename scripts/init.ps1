$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")

$Directories = @(
    ".github/workflows",
    "assets/scripts/charts",
    "assets/scripts/data",
    "assets/scripts/ui",
    "assets/styles/components",
    "apps/web/public",
    "apps/web/src/components",
    "apps/web/src/charts",
    "apps/web/src/config",
    "apps/web/src/loaders",
    "apps/web/src/models",
    "apps/web/src/services",
    "apps/web/src/simulation",
    "apps/web/src/stores",
    "apps/web/src/types",
    "apps/web/src/utils",
    "apps/web/tests",
    "collector/bin",
    "collector/config",
    "collector/src/commands",
    "collector/src/contracts",
    "collector/src/data",
    "collector/src/exceptions",
    "collector/src/normalizers",
    "collector/src/providers/stocks",
    "collector/src/providers/gold",
    "collector/src/repositories",
    "collector/src/services",
    "collector/src/support",
    "collector/src/validators",
    "collector/tests/unit",
    "collector/tests/integration",
    "collector/tests/fixtures",
    "data/stocks",
    "data/gold",
    "data/corporate-actions",
    "data/exports",
    "schemas",
    "scripts",
    "docs"
)

foreach ($Directory in $Directories) {
    New-Item -ItemType Directory -Force -Path (Join-Path $RootDir $Directory) | Out-Null
}

Write-Host "Project folders initialized successfully."

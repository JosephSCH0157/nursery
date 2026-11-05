Set-StrictMode -Version Latest

function ConvertFrom-ForgeStrictCsvBoolean {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][AllowEmptyString()][AllowNull()][object]$Value,
    [Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9_]*$')][string]$FieldName
  )

  if ($null -eq $Value) { throw "$FieldName boolean value is missing." }
  $text = [string]$Value
  switch -CaseSensitive ($text) {
    't'     { return $true }
    'true'  { return $true }
    'f'     { return $false }
    'false' { return $false }
    ''      { throw "$FieldName boolean value is missing." }
    default { throw "$FieldName boolean value is malformed or unsupported." }
  }
}

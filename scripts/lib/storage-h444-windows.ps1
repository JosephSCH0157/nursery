param(
  [Parameter(Mandatory=$true)][ValidateSet('Protect','Unprotect','Restrict','Verify')][string]$Action,
  [string]$Directory
)
$ErrorActionPreference = 'Stop'
try {
  if ($Action -in @('Protect','Unprotect')) {
    Add-Type -AssemblyName System.Security
    $encoded = [Console]::In.ReadToEnd()
    if ($encoded.Length -gt 16384) { throw 'bound' }
    $bytes = [Convert]::FromBase64String($encoded)
    $entropy = [Text.Encoding]::UTF8.GetBytes('forge.h444.synthetic-envelope.v1')
    try {
      if ($Action -eq 'Protect') {
        if ($bytes.Length -ne 32) { throw 'key length' }
        $result = [Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
      } else {
        $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        if ($result.Length -ne 32) { throw 'key length' }
      }
      # Private pipe to supervising Node process only; never a console invocation.
      [Console]::Out.Write([Convert]::ToBase64String($result))
    } finally {
      if ($bytes) { [Array]::Clear($bytes,0,$bytes.Length) }
      if ($result) { [Array]::Clear($result,0,$result.Length) }
    }
    exit 0
  }
  $resolved = [IO.Path]::GetFullPath($Directory)
  if (-not [IO.Directory]::Exists($resolved)) { throw 'directory missing' }
  $item = Get-Item -LiteralPath $resolved -Force
  if ($Action -eq 'Restrict' -and $item.Name -notmatch '^forge-h444-offline-[a-f0-9]{16}$') { throw 'test directory required' }
  $ancestor = $item
  while ($ancestor) {
    if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse point' }
    $ancestor = $ancestor.Parent
  }
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  if ($Action -eq 'Restrict') {
    if (@(Get-ChildItem -Force -LiteralPath $resolved).Count) { throw 'nonempty' }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($owner)
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($sid in @($owner,$system)) {
      $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
      $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $resolved -AclObject $acl
  }
  $acl = Get-Acl -LiteralPath $resolved
  if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner.Value) { throw 'owner or inheritance' }
  $rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne 2) { throw 'rule count' }
  foreach ($sid in @($owner.Value,$system.Value)) {
    $rule = @($rules | Where-Object { $_.IdentityReference.Value -eq $sid })
    if ($rule.Count -ne 1 -or $rule[0].AccessControlType -ne 'Allow' -or $rule[0].FileSystemRights -ne 'FullControl' -or $rule[0].IsInherited -or $rule[0].InheritanceFlags.ToString() -ne 'ContainerInherit, ObjectInherit') { throw 'access rule' }
  }
  [Console]::Out.Write('VERIFIED')
} catch {
  [Console]::Error.Write('h444_windows_control_failed')
  exit 1
}

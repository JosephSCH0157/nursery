Set-StrictMode -Version Latest

$script:ForgeCredentialTypeGeneric = 1
$script:ForgeCredentialPersistLocalMachine = 2
$script:ForgeDatabaseCredentialTarget = 'PodcastersForge/Supabase/wtvdjndyxegudufrompx/database-password'

function Initialize-ForgeCredentialNativeType {
  if ($null -ne ('Forge.WindowsCredentialNative' -as [type])) { return }
  if (-not $IsWindows) { throw 'Forge managed credentials require Windows Credential Manager.' }

  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Forge {
  public static class WindowsCredentialNative {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NativeCredential {
      public UInt32 Flags;
      public UInt32 Type;
      public string TargetName;
      public string Comment;
      public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
      public UInt32 CredentialBlobSize;
      public IntPtr CredentialBlob;
      public UInt32 Persist;
      public UInt32 AttributeCount;
      public IntPtr Attributes;
      public string TargetAlias;
      public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWrite(ref NativeCredential credential, UInt32 flags);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern void CredFree(IntPtr credential);

    public static bool Exists(string target) {
      IntPtr pointer;
      if (!CredRead(target, 1, 0, out pointer)) {
        int error = Marshal.GetLastWin32Error();
        if (error == 1168) return false;
        throw new Win32Exception(error, "Unable to inspect Windows Credential Manager.");
      }
      CredFree(pointer);
      return true;
    }

    public static string Read(string target) {
      IntPtr pointer;
      if (!CredRead(target, 1, 0, out pointer)) {
        int error = Marshal.GetLastWin32Error();
        if (error == 1168) throw new InvalidOperationException("Forge database credential is not enrolled.");
        throw new Win32Exception(error, "Unable to read Windows Credential Manager.");
      }
      try {
        NativeCredential credential = Marshal.PtrToStructure<NativeCredential>(pointer);
        if (credential.CredentialBlob == IntPtr.Zero || credential.CredentialBlobSize == 0) {
          throw new InvalidOperationException("Forge database credential is empty.");
        }
        return Marshal.PtrToStringUni(credential.CredentialBlob, checked((int)credential.CredentialBlobSize / 2));
      } finally {
        CredFree(pointer);
      }
    }

    public static void Write(string target, string userName, string secret) {
      if (String.IsNullOrWhiteSpace(secret)) throw new ArgumentException("Credential secret cannot be empty.", "secret");
      UInt32 blobSize = checked((UInt32)Encoding.Unicode.GetByteCount(secret));
      IntPtr blob = Marshal.StringToCoTaskMemUni(secret);
      try {
        NativeCredential credential = new NativeCredential {
          Type = 1,
          TargetName = target,
          UserName = userName,
          CredentialBlobSize = blobSize,
          CredentialBlob = blob,
          Persist = 2,
          Comment = "Podcasters Forge governed Supabase deployment credential"
        };
        if (!CredWrite(ref credential, 0)) {
          throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to write Windows Credential Manager.");
        }
      } finally {
        Marshal.ZeroFreeCoTaskMemUnicode(blob);
      }
    }

    public static bool Delete(string target) {
      if (CredDelete(target, 1, 0)) return true;
      int error = Marshal.GetLastWin32Error();
      if (error == 1168) return false;
      throw new Win32Exception(error, "Unable to delete from Windows Credential Manager.");
    }
  }
}
'@
}
function Get-ForgeDatabaseCredentialTarget {
  return $script:ForgeDatabaseCredentialTarget
}

function Test-ForgeManagedCredential {
  [CmdletBinding()]
  param([string]$Target = $script:ForgeDatabaseCredentialTarget)
  Initialize-ForgeCredentialNativeType
  return [Forge.WindowsCredentialNative]::Exists($Target)
}

function Set-ForgeManagedCredential {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][Security.SecureString]$Secret,
    [string]$Target = $script:ForgeDatabaseCredentialTarget,
    [string]$UserName = 'postgres'
  )
  Initialize-ForgeCredentialNativeType
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  $plain = $null
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Forge.WindowsCredentialNative]::Write($Target, $UserName, $plain)
  } finally {
    if ($null -ne $plain) { $plain = $null }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Remove-ForgeManagedCredential {
  [CmdletBinding()]
  param([string]$Target = $script:ForgeDatabaseCredentialTarget)
  Initialize-ForgeCredentialNativeType
  return [Forge.WindowsCredentialNative]::Delete($Target)
}

function Invoke-WithForgeManagedDatabaseCredential {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][scriptblock]$Operation,
    [object[]]$ArgumentList = @(),
    [string]$Target = $script:ForgeDatabaseCredentialTarget
  )
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD', 'Process'))) {
    throw 'Refusing to overwrite an existing process-scoped SUPABASE_DB_PASSWORD.'
  }
  Initialize-ForgeCredentialNativeType
  $secret = $null
  try {
    $secret = [Forge.WindowsCredentialNative]::Read($Target)
    [Environment]::SetEnvironmentVariable('SUPABASE_DB_PASSWORD', $secret, 'Process')
    return & $Operation @ArgumentList
  } finally {
    [Environment]::SetEnvironmentVariable('SUPABASE_DB_PASSWORD', $null, 'Process')
    $secret = $null
  }
}

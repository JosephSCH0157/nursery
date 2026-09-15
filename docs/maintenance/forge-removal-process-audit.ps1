# Read-only process/resource inspection. No shutdown/restart APIs are called.
if (-not ('ForgeRemovalNativeAudit' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ForgeRemovalNativeAudit {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h,IntPtr addr,byte[] data,int count,out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr h,out bool wow);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h,int cls,IntPtr data,int size,out int returned);
  static byte[] Read(IntPtr h,long address,int length) {var b=new byte[length];IntPtr read;if(!ReadProcessMemory(h,new IntPtr(address),b,length,out read)||read.ToInt64()!=length)throw new Exception("read_unavailable");return b;}
  static long Ptr(IntPtr h,long address,bool x86) {var b=Read(h,address,x86?4:8);return x86?BitConverter.ToUInt32(b,0):BitConverter.ToInt64(b,0);}
  public static string Cwd(int pid) {
    IntPtr h=OpenProcess(0x410,false,pid);if(h==IntPtr.Zero)return null;
    IntPtr info=Marshal.AllocHGlobal(48);
    try {bool x86;if(!IsWow64Process(h,out x86))return null;int n;
      if(NtQueryInformationProcess(h,x86?26:0,info,x86?8:48,out n)!=0)return null;
      long peb=Marshal.ReadIntPtr(info,x86?0:8).ToInt64();
      long pp=Ptr(h,peb+(x86?0x10:0x20),x86);long field=pp+(x86?0x24:0x38);
      int len=BitConverter.ToUInt16(Read(h,field,2),0);if(len<=0||len>32766)return null;
      return Encoding.Unicode.GetString(Read(h,Ptr(h,field+(x86?4:8),x86),len));
    } catch{return null;}finally{Marshal.FreeHGlobal(info);CloseHandle(h);}
  }
  [StructLayout(LayoutKind.Sequential)] struct UniqueProcess {public uint pid;public System.Runtime.InteropServices.ComTypes.FILETIME start;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ProcessInfo {
    public UniqueProcess process;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)]public string app;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=64)]public string service;
    public uint type,status,session;[MarshalAs(UnmanagedType.Bool)]public bool restartable;
  }
  [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)]static extern int RmStartSession(out uint session,int flags,StringBuilder key);
  [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)]static extern int RmRegisterResources(uint session,uint count,string[] files,uint apps,IntPtr app,uint services,IntPtr svc);
  [DllImport("rstrtmgr.dll")]static extern int RmGetList(uint session,out uint needed,ref uint count,[In,Out]ProcessInfo[] apps,ref uint reboot);
  [DllImport("rstrtmgr.dll")]static extern int RmEndSession(uint session);
  public static int[] Users(string[] files) {
    if(files.Length==0)return new int[0];uint session;int error=RmStartSession(out session,0,new StringBuilder(33));if(error!=0)throw new Exception("resource_session_error_"+error);
    try {for(int i=0;i<files.Length;i+=128){int len=Math.Min(128,files.Length-i);var batch=new string[len];Array.Copy(files,i,batch,0,len);error=RmRegisterResources(session,(uint)len,batch,0,IntPtr.Zero,0,IntPtr.Zero);if(error!=0)throw new Exception("resource_registration_error_"+error);}
      uint need,count=0,reboot=0;error=RmGetList(session,out need,ref count,null,ref reboot);if(error==0)return new int[0];if(error!=234)throw new Exception("resource_query_error_"+error);
      count=need;var list=new ProcessInfo[count];error=RmGetList(session,out need,ref count,list,ref reboot);if(error!=0)throw new Exception("resource_query_error_"+error);var ids=new List<int>();for(int i=0;i<count;i++)ids.Add((int)list[i].process.pid);return ids.ToArray();
    }finally{RmEndSession(session);}
  }
}
'@
}
function Get-ForgePathUsers([string]$Target, [string[]]$Files) {
  $normalized = $Target.Replace('/', '\').TrimEnd('\')
  $users = @()
  foreach ($proc in Get-CimInstance Win32_Process) {
    # Exclude only the current audit shell, whose command names its own target.
    if ($proc.ProcessId -eq $PID) { continue }
    $cwd = [ForgeRemovalNativeAudit]::Cwd([int]$proc.ProcessId)
    $matchesCwd = $cwd -and ($cwd.TrimEnd('\').Equals($normalized,[StringComparison]::OrdinalIgnoreCase) -or $cwd.StartsWith($normalized+'\',[StringComparison]::OrdinalIgnoreCase))
    $cmd = ([string]$proc.CommandLine).Replace('/', '\')
    $exe = ([string]$proc.ExecutablePath).Replace('/', '\')
    if ($matchesCwd -or $cmd.IndexOf($normalized,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $exe.StartsWith($normalized+'\',[StringComparison]::OrdinalIgnoreCase)) {
      $users += [pscustomobject]@{pid=$proc.ProcessId;name=$proc.Name;cwdMatch=[bool]$matchesCwd;commandOrExecutableMatch=($cmd.IndexOf($normalized,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $exe.StartsWith($normalized+'\',[StringComparison]::OrdinalIgnoreCase))}
    }
  }
  $locked = [ForgeRemovalNativeAudit]::Users($Files)
  [pscustomobject]@{processReferences=$users;resourceUsers=@($locked)}
}

# Reads and sets desktop icon positions through the shell's own view of the
# desktop (IFolderView), the same object Explorer uses. No registry edits,
# no Explorer restart.
#
#   desktop-icons.ps1 get            -> JSON { autoArrange, spacing, workArea, items: [{name,x,y}] }
#   desktop-icons.ps1 set <file>     <- JSON [{name,x,y}] ; -> JSON { placed, missing, autoArrange }

param([string]$Command = 'get', [string]$File = '')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

public static class TemboDesktop
{
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IComServiceProvider
    {
        [PreserveSig] int QueryService(ref Guid guidService, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out object ppvObject);
    }

    [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellBrowser
    {
        [PreserveSig] int GetWindow(out IntPtr phwnd);
        [PreserveSig] int ContextSensitiveHelp(int fEnterMode);
        [PreserveSig] int InsertMenusSB(IntPtr hmenuShared, IntPtr lpMenuWidths);
        [PreserveSig] int SetMenuSB(IntPtr hmenuShared, IntPtr holemenuRes, IntPtr hwndActiveObject);
        [PreserveSig] int RemoveMenusSB(IntPtr hmenuShared);
        [PreserveSig] int SetStatusTextSB(IntPtr pszStatusText);
        [PreserveSig] int EnableModelessSB(int fEnable);
        [PreserveSig] int TranslateAcceleratorSB(IntPtr pmsg, ushort wID);
        [PreserveSig] int BrowseObject(IntPtr pidl, uint wFlags);
        [PreserveSig] int GetViewStateStream(uint grfMode, out IntPtr ppStrm);
        [PreserveSig] int GetControlWindow(uint id, out IntPtr phwnd);
        [PreserveSig] int SendControlMsg(uint id, uint uMsg, IntPtr wParam, IntPtr lParam, out IntPtr pret);
        [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.Interface)] out object ppshv);
    }

    [ComImport, Guid("CDE725B0-CCC9-4519-917E-325D72FAB4CE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFolderView
    {
        [PreserveSig] int GetCurrentViewMode(out uint pViewMode);
        [PreserveSig] int SetCurrentViewMode(uint ViewMode);
        [PreserveSig] int GetFolder(ref Guid riid, out IntPtr ppv);
        [PreserveSig] int Item(int iItemIndex, out IntPtr ppidl);
        [PreserveSig] int ItemCount(uint uFlags, out int pcItems);
        [PreserveSig] int Items(uint uFlags, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetSelectionMarkedItem(out int piItem);
        [PreserveSig] int GetFocusedItem(out int piItem);
        [PreserveSig] int GetItemPosition(IntPtr pidl, out POINT ppt);
        [PreserveSig] int GetSpacing(ref POINT ppt);
        [PreserveSig] int GetDefaultSpacing(out POINT ppt);
        [PreserveSig] int GetAutoArrange();
        [PreserveSig] int SelectItem(int iItem, uint dwFlags);
        [PreserveSig] int SelectAndPositionItems(uint cidl, [MarshalAs(UnmanagedType.LPArray)] IntPtr[] apidl, [MarshalAs(UnmanagedType.LPArray)] POINT[] apt, uint dwFlags);
    }

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref RECT pvParam, uint fWinIni);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetNameFromIDList(IntPtr pidl, uint sigdnName, out IntPtr ppszName);

    const int SWC_DESKTOP = 8;
    const int SWFO_NEEDDISPATCH = 1;
    const uint SVGIO_ALLVIEW = 2;
    const uint SVSI_POSITIONITEM = 0x80;
    const uint SIGDN_PARENTRELATIVEPARSING = 0x80018001;
    const uint SPI_GETWORKAREA = 0x0030;

    static IFolderView DesktopView()
    {
        SetProcessDPIAware(); // positions are in physical pixels, like Explorer's
        Type t = Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39"));
        object windows = Activator.CreateInstance(t);
        object[] args = new object[] { 0, null, SWC_DESKTOP, 0, SWFO_NEEDDISPATCH };
        ParameterModifier mods = new ParameterModifier(5);
        mods[0] = true; mods[1] = true; mods[3] = true; // VARIANT* in, long* out
        object disp = t.InvokeMember("FindWindowSW", BindingFlags.InvokeMethod, null, windows, args,
            new ParameterModifier[] { mods }, null, null);
        IComServiceProvider sp = (IComServiceProvider)disp;
        Guid sidTopLevel = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");
        Guid iidBrowser = new Guid("000214E2-0000-0000-C000-000000000046");
        object browserObj;
        Marshal.ThrowExceptionForHR(sp.QueryService(ref sidTopLevel, ref iidBrowser, out browserObj));
        IShellBrowser browser = (IShellBrowser)browserObj;
        object view;
        Marshal.ThrowExceptionForHR(browser.QueryActiveShellView(out view));
        return (IFolderView)view;
    }

    static Dictionary<string, IntPtr> Items(IFolderView fv)
    {
        Dictionary<string, IntPtr> map = new Dictionary<string, IntPtr>(StringComparer.OrdinalIgnoreCase);
        int count;
        Marshal.ThrowExceptionForHR(fv.ItemCount(SVGIO_ALLVIEW, out count));
        for (int i = 0; i < count; i++)
        {
            IntPtr pidl;
            if (fv.Item(i, out pidl) != 0) continue;
            IntPtr psz;
            if (SHGetNameFromIDList(pidl, SIGDN_PARENTRELATIVEPARSING, out psz) == 0)
            {
                string name = Marshal.PtrToStringUni(psz);
                Marshal.FreeCoTaskMem(psz);
                // Files are keyed by their file name; virtual items keep "::{CLSID}".
                if (!name.StartsWith("::") && name.IndexOf('\\') >= 0) name = System.IO.Path.GetFileName(name);
                if (!map.ContainsKey(name)) { map[name] = pidl; continue; }
            }
            Marshal.FreeCoTaskMem(pidl);
        }
        return map;
    }

    static void Free(Dictionary<string, IntPtr> items)
    {
        foreach (IntPtr p in items.Values) Marshal.FreeCoTaskMem(p);
    }

    public class Icon { public string name; public int x; public int y; }

    public class State
    {
        public bool autoArrange;
        public POINT spacing;
        public RECT workArea;
        public List<Icon> items = new List<Icon>();
    }

    public static State Get()
    {
        IFolderView fv = DesktopView();
        State s = new State();
        s.autoArrange = fv.GetAutoArrange() == 0;
        POINT sp = new POINT();
        fv.GetSpacing(ref sp);
        s.spacing = sp;
        RECT wa = new RECT();
        SystemParametersInfo(SPI_GETWORKAREA, 0, ref wa, 0);
        s.workArea = wa;
        Dictionary<string, IntPtr> items = Items(fv);
        try
        {
            foreach (KeyValuePair<string, IntPtr> kv in items)
            {
                POINT pt;
                if (fv.GetItemPosition(kv.Value, out pt) != 0) continue;
                Icon ic = new Icon();
                ic.name = kv.Key; ic.x = pt.X; ic.y = pt.Y;
                s.items.Add(ic);
            }
        }
        finally { Free(items); }
        return s;
    }

    public class SetResult { public int placed; public List<string> missing = new List<string>(); public bool autoArrange; }

    // Icons of freshly moved files appear with a delay, so wait for them a little.
    public static SetResult Set(string[] names, int[] xs, int[] ys)
    {
        IFolderView fv = DesktopView();
        SetResult r = new SetResult();
        r.autoArrange = fv.GetAutoArrange() == 0;
        Dictionary<string, IntPtr> items = null;
        for (int attempt = 0; attempt < 20; attempt++)
        {
            if (items != null) Free(items);
            items = Items(fv);
            bool all = true;
            foreach (string n in names) if (!items.ContainsKey(n)) { all = false; break; }
            if (all) break;
            Thread.Sleep(300);
        }
        try
        {
            List<IntPtr> pidls = new List<IntPtr>();
            List<POINT> pts = new List<POINT>();
            for (int i = 0; i < names.Length; i++)
            {
                IntPtr pidl;
                if (!items.TryGetValue(names[i], out pidl)) { r.missing.Add(names[i]); continue; }
                POINT p = new POINT(); p.X = xs[i]; p.Y = ys[i];
                pidls.Add(pidl); pts.Add(p);
            }
            if (pidls.Count > 0)
                Marshal.ThrowExceptionForHR(fv.SelectAndPositionItems((uint)pidls.Count, pidls.ToArray(), pts.ToArray(), SVSI_POSITIONITEM));
            r.placed = pidls.Count;
        }
        finally { Free(items); }
        return r;
    }
}
'@

try {
    if ($Command -eq 'get') {
        $s = [TemboDesktop]::Get()
        [ordered]@{
            autoArrange = $s.autoArrange
            spacing = @{ x = $s.spacing.X; y = $s.spacing.Y }
            workArea = @{ left = $s.workArea.Left; top = $s.workArea.Top; right = $s.workArea.Right; bottom = $s.workArea.Bottom }
            items = @($s.items | ForEach-Object { @{ name = $_.name; x = $_.x; y = $_.y } })
        } | ConvertTo-Json -Depth 4 -Compress
    } elseif ($Command -eq 'set') {
        # Passed as an argument, not piped: Windows PowerShell would wrap the array.
        $want = ConvertFrom-Json ([IO.File]::ReadAllText($File, [Text.Encoding]::UTF8))
        $names = [string[]]@($want | ForEach-Object { $_.name })
        $xs = [int[]]@($want | ForEach-Object { $_.x })
        $ys = [int[]]@($want | ForEach-Object { $_.y })
        $r = [TemboDesktop]::Set($names, $xs, $ys)
        [ordered]@{ placed = $r.placed; missing = @($r.missing); autoArrange = $r.autoArrange } | ConvertTo-Json -Compress
    }
} catch {
    [ordered]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}

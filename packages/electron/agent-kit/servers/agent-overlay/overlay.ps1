param(
    [Parameter(Mandatory = $true)]
    [string]$StateDirectory,

    [string]$Label = 'AI CONTROL ACTIVE'
)

$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $StateDirectory 'overlay.pid'
$errorPath = Join-Path $StateDirectory 'overlay-error.log'

try {
    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName PresentationFramework
    Add-Type -AssemblyName WindowsBase

    Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class OpenDeputyOverlayNative
{
    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TRANSPARENT = 0x00000020L;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_NOACTIVATE = 0x08000000L;

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong", SetLastError = true)]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong", SetLastError = true)]
    private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

    public static void MakeClickThrough(IntPtr hwnd)
    {
        if (IntPtr.Size == 8)
        {
            long style = GetWindowLongPtr64(hwnd, GWL_EXSTYLE).ToInt64();
            SetWindowLongPtr64(hwnd, GWL_EXSTYLE, new IntPtr(style | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE));
        }
        else
        {
            int style = GetWindowLong32(hwnd, GWL_EXSTYLE);
            SetWindowLong32(hwnd, GWL_EXSTYLE, style | (int)WS_EX_TRANSPARENT | (int)WS_EX_TOOLWINDOW | (int)WS_EX_NOACTIVATE);
        }
    }
}
"@

    Set-Content -LiteralPath $pidPath -Value $PID -Encoding Ascii

    $app = [System.Windows.Application]::new()
    $app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown

    $overlay = [System.Windows.Window]::new()
    $overlay.Left = [System.Windows.SystemParameters]::VirtualScreenLeft
    $overlay.Top = [System.Windows.SystemParameters]::VirtualScreenTop
    $overlay.Width = [System.Windows.SystemParameters]::VirtualScreenWidth
    $overlay.Height = [System.Windows.SystemParameters]::VirtualScreenHeight
    $overlay.WindowStyle = [System.Windows.WindowStyle]::None
    $overlay.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $overlay.AllowsTransparency = $true
    $overlay.Background = [System.Windows.Media.Brushes]::Transparent
    $overlay.Topmost = $true
    $overlay.ShowInTaskbar = $false
    $overlay.Focusable = $false

    $frame = [System.Windows.Controls.Border]::new()
    $frame.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromRgb(37, 99, 235))
    $frame.BorderThickness = [System.Windows.Thickness]::new(5)
    $frame.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(18, 15, 23, 42))
    $overlay.Content = $frame

    $overlay.Add_SourceInitialized({
        $helper = [System.Windows.Interop.WindowInteropHelper]::new($overlay)
        [OpenDeputyOverlayNative]::MakeClickThrough($helper.Handle)
    })

    $control = [System.Windows.Window]::new()
    $control.Width = 210
    $control.Height = 48
    $control.Left = [System.Windows.SystemParameters]::VirtualScreenLeft + [System.Windows.SystemParameters]::VirtualScreenWidth - 230
    $control.Top = [System.Windows.SystemParameters]::VirtualScreenTop + 18
    $control.WindowStyle = [System.Windows.WindowStyle]::None
    $control.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $control.AllowsTransparency = $true
    $control.Background = [System.Windows.Media.Brushes]::Transparent
    $control.Topmost = $true
    $control.ShowInTaskbar = $false

    $button = [System.Windows.Controls.Button]::new()
    $button.Content = "STOP - $Label"
    $button.FontSize = 12
    $button.FontWeight = [System.Windows.FontWeights]::SemiBold
    $button.Foreground = [System.Windows.Media.Brushes]::White
    $button.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromRgb(185, 28, 28))
    $button.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromRgb(254, 202, 202))
    $button.BorderThickness = [System.Windows.Thickness]::new(1)
    $button.Add_Click({ $app.Shutdown() })
    $control.Content = $button

    $overlay.Show()
    $control.Show()
    [void]$app.Run()
}
catch {
    $_ | Out-String | Set-Content -LiteralPath $errorPath -Encoding UTF8
    throw
}
finally {
    if (Test-Path -LiteralPath $pidPath) {
        $recordedPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
        if ($recordedPid -eq [string]$PID) {
            Remove-Item -LiteralPath $pidPath -Force
        }
    }
}

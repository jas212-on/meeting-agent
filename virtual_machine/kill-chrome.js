// kill-chrome.js: Instantly terminates only the meeting-agent Chrome instance
// Uses Windows Script Host WMI for sub-millisecond process inspection and termination.
try {
  var wmi = GetObject("winmgmts:");
  var procs = wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'chrome.exe'");
  var e = new Enumerator(procs);
  var count = 0;
  for (; !e.atEnd(); e.moveNext()) {
    var p = e.item();
    var cmd = p.CommandLine ? p.CommandLine.toLowerCase() : "";
    var isBot = false;
    if (cmd.indexOf("profiles") !== -1 && (cmd.indexOf("meet") !== -1 || cmd.indexOf("user-data-dir") !== -1)) {
      isBot = true;
    } else if (cmd.indexOf("--remote-debugging-pipe") !== -1 && cmd.indexOf("meeting-agent") !== -1) {
      isBot = true;
    }
    if (isBot) {
      try {
        p.Terminate(0);
        count++;
      } catch (err) {}
    }
  }
} catch (outerErr) {}

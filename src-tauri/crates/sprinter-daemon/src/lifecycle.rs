use std::fs;
use std::net::SocketAddr;
use std::path::Path;

/// Check if a daemon is already running. Returns error if one is alive.
pub fn check_existing_daemon(data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let pid_file = data_dir.join("daemon.pid");
    if pid_file.exists() {
        let pid_str = fs::read_to_string(&pid_file)?;
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            // Check if the process is alive
            match nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid), None) {
                Ok(_) => {
                    return Err(format!(
                        "Daemon already running with PID {}. Remove {} to force.",
                        pid,
                        pid_file.display()
                    )
                    .into());
                }
                Err(_) => {
                    // Stale PID file, clean up
                    tracing::warn!("Removing stale PID file for PID {}", pid);
                    cleanup(data_dir);
                }
            }
        }
    }
    Ok(())
}

/// Bind to localhost with an OS-assigned port.
pub fn bind_address() -> Result<SocketAddr, Box<dyn std::error::Error>> {
    // Bind a temporary socket to get a free port
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let addr = listener.local_addr()?;
    drop(listener);
    Ok(addr)
}

pub fn write_pid_file(data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let pid = std::process::id();
    let tmp = data_dir.join("daemon.pid.tmp");
    let target = data_dir.join("daemon.pid");
    fs::write(&tmp, pid.to_string())?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

pub fn write_port_file(data_dir: &Path, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let tmp = data_dir.join("daemon.port.tmp");
    let target = data_dir.join("daemon.port");
    fs::write(&tmp, port.to_string())?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

pub fn cleanup(data_dir: &Path) {
    let _ = fs::remove_file(data_dir.join("daemon.pid"));
    let _ = fs::remove_file(data_dir.join("daemon.port"));
    let _ = fs::remove_file(data_dir.join("daemon.pid.tmp"));
    let _ = fs::remove_file(data_dir.join("daemon.port.tmp"));
}

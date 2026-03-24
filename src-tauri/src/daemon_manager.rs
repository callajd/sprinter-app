use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::time::sleep;
use tonic::transport::Channel;

use sprinter_proto::command_service_client::CommandServiceClient;
use sprinter_proto::PingRequest;

const MAX_STARTUP_WAIT: Duration = Duration::from_secs(10);
const POLL_INTERVAL: Duration = Duration::from_millis(200);

pub struct DaemonManager {
    data_dir: PathBuf,
    daemon_binary: Option<PathBuf>,
}

impl DaemonManager {
    pub fn new() -> Self {
        let data_dir = std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join(".sprinter"))
            .expect("HOME not set");

        Self {
            data_dir,
            daemon_binary: None,
        }
    }

    pub fn with_binary(mut self, path: PathBuf) -> Self {
        self.daemon_binary = Some(path);
        self
    }

    fn port_file(&self) -> PathBuf {
        self.data_dir.join("daemon.port")
    }

    fn pid_file(&self) -> PathBuf {
        self.data_dir.join("daemon.pid")
    }

    fn read_port(&self) -> Option<u16> {
        std::fs::read_to_string(self.port_file())
            .ok()
            .and_then(|s| s.trim().parse().ok())
    }

    fn read_pid(&self) -> Option<u32> {
        std::fs::read_to_string(self.pid_file())
            .ok()
            .and_then(|s| s.trim().parse().ok())
    }

    fn is_daemon_alive(&self) -> bool {
        if let Some(pid) = self.read_pid() {
            unsafe { libc::kill(pid as i32, 0) == 0 }
        } else {
            false
        }
    }

    pub async fn ensure_running(&self) -> Result<CommandServiceClient<Channel>, String> {
        // Try connecting to existing daemon
        if let Some(client) = self.try_connect().await {
            return Ok(client);
        }

        // Start the daemon
        self.start_daemon()?;

        // Wait for it to become ready
        let start = std::time::Instant::now();
        while start.elapsed() < MAX_STARTUP_WAIT {
            if let Some(client) = self.try_connect().await {
                return Ok(client);
            }
            sleep(POLL_INTERVAL).await;
        }

        Err("Daemon failed to start within timeout".to_string())
    }

    async fn try_connect(&self) -> Option<CommandServiceClient<Channel>> {
        let port = self.read_port()?;
        let endpoint = format!("http://127.0.0.1:{}", port);
        let channel = Channel::from_shared(endpoint).ok()?.connect().await.ok()?;
        let mut client = CommandServiceClient::new(channel);

        // Verify with ping
        match client.ping(PingRequest {}).await {
            Ok(_) => Some(client),
            Err(_) => None,
        }
    }

    fn start_daemon(&self) -> Result<(), String> {
        let binary = self.find_daemon_binary()?;

        std::fs::create_dir_all(&self.data_dir).map_err(|e| e.to_string())?;

        let mut cmd = Command::new(&binary);
        cmd.arg("--data-dir")
            .arg(&self.data_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        // Detach the process so it survives app close
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    libc::setsid();
                    Ok(())
                });
            }
        }

        cmd.spawn().map_err(|e| format!("Failed to start daemon: {}", e))?;

        Ok(())
    }

    fn find_daemon_binary(&self) -> Result<PathBuf, String> {
        if let Some(ref path) = self.daemon_binary {
            return Ok(path.clone());
        }

        // In development, look for it in the cargo target directory
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("debug")
            .join("sprinter-daemon");
        if dev_path.exists() {
            return Ok(dev_path);
        }

        // Try PATH
        if let Ok(output) = Command::new("which").arg("sprinter-daemon").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return Ok(PathBuf::from(path));
            }
        }

        Err("Could not find sprinter-daemon binary. Build it first with: cargo build -p sprinter-daemon".to_string())
    }
}

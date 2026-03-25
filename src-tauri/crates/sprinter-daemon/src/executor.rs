use chrono::Utc;
use sprinter_common::db::Database;
use sprinter_common::models::{CommandRecord, CommandStatus, OutputChunkRecord};
use sprinter_proto::{
    CommandCompleted, CommandEvent, CommandFailed, CommandSpec, CommandStarted, OutputChunk,
    OutputStream, ShellCommand,
};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, Mutex};
use tokio_util::sync::CancellationToken;

use uuid::Uuid;

const BROADCAST_CAPACITY: usize = 4096;

struct RunningCommand {
    sender: broadcast::Sender<CommandEvent>,
    cancel: CancellationToken,
}

pub struct CommandExecutor {
    db: Arc<Mutex<Database>>,
    running: Arc<Mutex<HashMap<String, RunningCommand>>>,
}

impl CommandExecutor {
    pub fn new(db: Database) -> Self {
        Self {
            db: Arc::new(Mutex::new(db)),
            running: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn spawn_shell(
        &self,
        shell_cmd: ShellCommand,
    ) -> Result<(String, broadcast::Receiver<CommandEvent>), String> {
        let command_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        // Persist command to DB
        let proto_spec = CommandSpec {
            spec: Some(sprinter_proto::command_spec::Spec::Shell(shell_cmd.clone())),
        };
        let spec_json = serde_json::to_string(&proto_spec).map_err(|e| e.to_string())?;

        let record = CommandRecord {
            id: command_id.clone(),
            spec_json,
            status: CommandStatus::Pending,
            pid: None,
            exit_code: None,
            created_at: now.clone(),
            started_at: None,
            completed_at: None,
        };

        {
            let db = self.db.lock().await;
            db.insert_command(&record).map_err(|e| e.to_string())?;
        }

        let (tx, rx) = broadcast::channel(BROADCAST_CAPACITY);
        let cancel = CancellationToken::new();

        {
            let mut running = self.running.lock().await;
            running.insert(
                command_id.clone(),
                RunningCommand {
                    sender: tx.clone(),
                    cancel: cancel.clone(),
                },
            );
        }

        // Spawn the execution task
        let db = self.db.clone();
        let running = self.running.clone();
        let cmd_id = command_id.clone();
        let cmd_line = shell_cmd.command_line.clone();
        let work_dir = shell_cmd.working_directory.clone();

        tokio::spawn(async move {
            let result =
                run_shell_command(&cmd_id, &cmd_line, &work_dir, &tx, &cancel, &db).await;

            // Clean up running state
            running.lock().await.remove(&cmd_id);

            if let Err(e) = result {
                tracing::error!(command_id = %cmd_id, "Command execution error: {}", e);
            }
        });

        Ok((command_id, rx))
    }

    pub async fn kill_command(&self, command_id: &str, signal: i32) -> Result<(), String> {
        let running = self.running.lock().await;
        if let Some(handle) = running.get(command_id) {
            handle.cancel.cancel();
            // Also try to send OS signal if we have a PID
            let db = self.db.lock().await;
            if let Ok(Some(record)) = db.get_command(command_id) {
                if let Some(pid) = record.pid {
                    let sig = nix::sys::signal::Signal::try_from(signal)
                        .unwrap_or(nix::sys::signal::Signal::SIGTERM);
                    let _ = nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid as i32), sig);
                }
            }
            Ok(())
        } else {
            Err(format!("Command {} is not running", command_id))
        }
    }

    pub async fn subscribe(
        &self,
        command_id: &str,
    ) -> Option<broadcast::Receiver<CommandEvent>> {
        let running = self.running.lock().await;
        running.get(command_id).map(|h| h.sender.subscribe())
    }

    pub fn db(&self) -> &Arc<Mutex<Database>> {
        &self.db
    }
}

async fn run_shell_command(
    command_id: &str,
    cmd_line: &str,
    work_dir: &str,
    tx: &broadcast::Sender<CommandEvent>,
    cancel: &CancellationToken,
    db: &Arc<Mutex<Database>>,
) -> Result<(), String> {
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(cmd_line);

    if !work_dir.is_empty() {
        cmd.current_dir(work_dir);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id().map(|p| p as i64);

    let started_at = Utc::now().to_rfc3339();

    // Update DB with started state
    {
        let db = db.lock().await;
        db.update_command_started(command_id, pid, &started_at)
            .map_err(|e| e.to_string())?;
    }

    // Send started event
    let _ = tx.send(CommandEvent {
        command_id: command_id.to_string(),
        event: Some(sprinter_proto::command_event::Event::Started(
            CommandStarted {
                pid: pid.unwrap_or(0),
                started_at: started_at.clone(),
            },
        )),
    });

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let sequence = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let chunk_buffer: Arc<Mutex<Vec<OutputChunkRecord>>> = Arc::new(Mutex::new(Vec::new()));

    // Spawn stdout reader
    let stdout_task = {
        let tx = tx.clone();
        let cmd_id = command_id.to_string();
        let seq = sequence.clone();
        let buf = chunk_buffer.clone();
        let db = db.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let s = seq.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let ts = Utc::now().to_rfc3339();
                let data = format!("{}\n", line).into_bytes();

                let _ = tx.send(CommandEvent {
                    command_id: cmd_id.clone(),
                    event: Some(sprinter_proto::command_event::Event::Output(OutputChunk {
                        stream: OutputStream::Stdout as i32,
                        data: data.clone(),
                        sequence: s,
                        timestamp: ts.clone(),
                    })),
                });

                let mut chunks = buf.lock().await;
                chunks.push(OutputChunkRecord {
                    id: 0,
                    command_id: cmd_id.clone(),
                    stream: "stdout".to_string(),
                    data,
                    sequence: s,
                    timestamp: ts,
                });

                // Flush to DB every 50 chunks
                if chunks.len() >= 50 {
                    let to_flush: Vec<_> = chunks.drain(..).collect();
                    let db = db.lock().await;
                    let _ = db.insert_output_chunks(&to_flush);
                }
            }
        })
    };

    // Spawn stderr reader
    let stderr_task = {
        let tx = tx.clone();
        let cmd_id = command_id.to_string();
        let seq = sequence.clone();
        let buf = chunk_buffer.clone();
        let db = db.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let s = seq.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let ts = Utc::now().to_rfc3339();
                let data = format!("{}\n", line).into_bytes();

                let _ = tx.send(CommandEvent {
                    command_id: cmd_id.clone(),
                    event: Some(sprinter_proto::command_event::Event::Output(OutputChunk {
                        stream: OutputStream::Stderr as i32,
                        data: data.clone(),
                        sequence: s,
                        timestamp: ts.clone(),
                    })),
                });

                let mut chunks = buf.lock().await;
                chunks.push(OutputChunkRecord {
                    id: 0,
                    command_id: cmd_id.clone(),
                    stream: "stderr".to_string(),
                    data,
                    sequence: s,
                    timestamp: ts,
                });

                if chunks.len() >= 50 {
                    let to_flush: Vec<_> = chunks.drain(..).collect();
                    let db = db.lock().await;
                    let _ = db.insert_output_chunks(&to_flush);
                }
            }
        })
    };

    // Wait for completion or cancellation
    tokio::select! {
        status = child.wait() => {
            // Wait for readers to finish
            let _ = stdout_task.await;
            let _ = stderr_task.await;

            // Flush remaining chunks
            let remaining: Vec<_> = chunk_buffer.lock().await.drain(..).collect();
            if !remaining.is_empty() {
                let db_lock = db.lock().await;
                let _ = db_lock.insert_output_chunks(&remaining);
            }

            let completed_at = Utc::now().to_rfc3339();
            match status {
                Ok(exit_status) => {
                    let code = exit_status.code().unwrap_or(-1);
                    let db_lock = db.lock().await;
                    let _ = db_lock.update_command_status(
                        command_id,
                        if code == 0 { &CommandStatus::Completed } else { &CommandStatus::Failed },
                        Some(code),
                        Some(&completed_at),
                    );

                    let _ = tx.send(CommandEvent {
                        command_id: command_id.to_string(),
                        event: Some(sprinter_proto::command_event::Event::Completed(CommandCompleted {
                            exit_code: code,
                            completed_at,
                        })),
                    });
                }
                Err(e) => {
                    let db_lock = db.lock().await;
                    let _ = db_lock.update_command_status(
                        command_id,
                        &CommandStatus::Failed,
                        None,
                        Some(&completed_at),
                    );

                    let _ = tx.send(CommandEvent {
                        command_id: command_id.to_string(),
                        event: Some(sprinter_proto::command_event::Event::Failed(CommandFailed {
                            error: e.to_string(),
                            failed_at: completed_at,
                        })),
                    });
                }
            }
        }
        _ = cancel.cancelled() => {
            // Kill the child process
            let _ = child.kill().await;
            let _ = stdout_task.await;
            let _ = stderr_task.await;

            // Flush remaining chunks
            let remaining: Vec<_> = chunk_buffer.lock().await.drain(..).collect();
            if !remaining.is_empty() {
                let db_lock = db.lock().await;
                let _ = db_lock.insert_output_chunks(&remaining);
            }

            let completed_at = Utc::now().to_rfc3339();
            let db_lock = db.lock().await;
            let _ = db_lock.update_command_status(
                command_id,
                &CommandStatus::Killed,
                None,
                Some(&completed_at),
            );

            let _ = tx.send(CommandEvent {
                command_id: command_id.to_string(),
                event: Some(sprinter_proto::command_event::Event::Failed(CommandFailed {
                    error: "Command killed".to_string(),
                    failed_at: completed_at,
                })),
            });
        }
    }

    Ok(())
}

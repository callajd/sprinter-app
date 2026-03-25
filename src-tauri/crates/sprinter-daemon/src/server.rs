use crate::executor::CommandExecutor;
use sprinter_proto::command_service_server::CommandService;
use sprinter_proto::*;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Instant;
use tokio::io::AsyncReadExt;
use tokio::process::Command as TokioCommand;
use tokio_stream::Stream;
use tonic::{Request, Response, Status};

/// Parse stored spec_json back into a CommandSpec protobuf.
///
/// prost's derived serde for oneof fields doesn't round-trip cleanly —
/// serialization produces `{"shell":{...}}` but deserialization expects
/// `{"spec":{"Shell":{...}}}`. We handle both formats here.
fn parse_spec_json(json: &str) -> Option<CommandSpec> {
    // Try direct prost serde deserialization first
    if let Ok(spec) = serde_json::from_str::<CommandSpec>(json) {
        if spec.spec.is_some() {
            return Some(spec);
        }
    }

    // Fallback: parse as generic JSON and reconstruct manually
    let val: serde_json::Value = serde_json::from_str(json).ok()?;
    let obj = val.as_object()?;

    // Handle {"shell": {"command_line": "...", ...}} format
    if let Some(shell) = obj.get("shell") {
        let command_line = shell.get("command_line")?.as_str()?.to_string();
        let working_directory = shell
            .get("working_directory")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let env = shell
            .get("env")
            .and_then(|v| v.as_object())
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        return Some(CommandSpec {
            spec: Some(command_spec::Spec::Shell(ShellCommand {
                command_line,
                working_directory,
                env,
            })),
        });
    }

    None
}

type EventStream = Pin<Box<dyn Stream<Item = Result<CommandEvent, Status>> + Send>>;

pub struct CommandServiceImpl {
    executor: Arc<CommandExecutor>,
    started_at: Instant,
}

impl CommandServiceImpl {
    pub fn new(executor: CommandExecutor) -> Self {
        Self {
            executor: Arc::new(executor),
            started_at: Instant::now(),
        }
    }
}

#[tonic::async_trait]
impl CommandService for CommandServiceImpl {
    type ExecuteCommandStream = EventStream;
    type StreamOutputStream = EventStream;

    async fn execute_command(
        &self,
        request: Request<ExecuteCommandRequest>,
    ) -> Result<Response<Self::ExecuteCommandStream>, Status> {
        let req = request.into_inner();
        let spec = req.spec.ok_or(Status::invalid_argument("missing spec"))?;

        let shell_cmd = match spec.spec {
            Some(command_spec::Spec::Shell(shell)) => shell,
            None => return Err(Status::invalid_argument("missing command spec variant")),
        };

        let (_command_id, mut rx) = self
            .executor
            .spawn_shell(shell_cmd)
            .await
            .map_err(|e| Status::internal(e))?;

        let stream = async_stream::stream! {
            while let Ok(event) = rx.recv().await {
                yield Ok(event);
            }
        };

        Ok(Response::new(Box::pin(stream)))
    }

    async fn execute_ephemeral_command(
        &self,
        request: Request<ExecuteEphemeralCommandRequest>,
    ) -> Result<Response<ExecuteEphemeralCommandResponse>, Status> {
        let req = request.into_inner();
        let spec = req.spec.ok_or(Status::invalid_argument("missing spec"))?;

        let shell_cmd = match spec.spec {
            Some(command_spec::Spec::Shell(shell)) => shell,
            None => return Err(Status::invalid_argument("missing command spec variant")),
        };

        let mut cmd = TokioCommand::new("sh");
        cmd.arg("-c").arg(&shell_cmd.command_line);

        if !shell_cmd.working_directory.is_empty() {
            cmd.current_dir(&shell_cmd.working_directory);
        }

        for (k, v) in &shell_cmd.env {
            cmd.env(k, v);
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| Status::internal(e.to_string()))?;

        let mut stdout_buf = Vec::new();
        let mut stderr_buf = Vec::new();

        if let Some(mut stdout) = child.stdout.take() {
            stdout
                .read_to_end(&mut stdout_buf)
                .await
                .map_err(|e| Status::internal(e.to_string()))?;
        }
        if let Some(mut stderr) = child.stderr.take() {
            stderr
                .read_to_end(&mut stderr_buf)
                .await
                .map_err(|e| Status::internal(e.to_string()))?;
        }

        let status = child
            .wait()
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(ExecuteEphemeralCommandResponse {
            exit_code: status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
            stderr: String::from_utf8_lossy(&stderr_buf).to_string(),
        }))
    }

    async fn kill_command(
        &self,
        request: Request<KillCommandRequest>,
    ) -> Result<Response<KillCommandResponse>, Status> {
        let req = request.into_inner();
        let signal = if req.signal == 0 { 15 } else { req.signal };

        match self.executor.kill_command(&req.command_id, signal).await {
            Ok(()) => Ok(Response::new(KillCommandResponse {
                success: true,
                message: "Kill signal sent".to_string(),
            })),
            Err(e) => Ok(Response::new(KillCommandResponse {
                success: false,
                message: e,
            })),
        }
    }

    async fn get_command(
        &self,
        request: Request<GetCommandRequest>,
    ) -> Result<Response<GetCommandResponse>, Status> {
        let req = request.into_inner();
        let db = self.executor.db().lock().await;

        let record = db
            .get_command(&req.command_id)
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or(Status::not_found("command not found"))?;

        let output_chunks = if req.include_output {
            db.get_output_chunks(&req.command_id, 0)
                .map_err(|e| Status::internal(e.to_string()))?
                .into_iter()
                .map(|c| OutputChunk {
                    stream: match c.stream.as_str() {
                        "stdout" => OutputStream::Stdout as i32,
                        "stderr" => OutputStream::Stderr as i32,
                        _ => OutputStream::Unspecified as i32,
                    },
                    data: c.data,
                    sequence: c.sequence,
                    timestamp: c.timestamp,
                })
                .collect()
        } else {
            vec![]
        };

        let spec = parse_spec_json(&record.spec_json);

        Ok(Response::new(GetCommandResponse {
            command: Some(CommandRecord {
                id: record.id,
                spec,
                status: record.status.as_str().to_string(),
                exit_code: record.exit_code,
                pid: record.pid,
                created_at: record.created_at,
                started_at: record.started_at,
                completed_at: record.completed_at,
                output_chunks,
            }),
        }))
    }

    async fn list_commands(
        &self,
        request: Request<ListCommandsRequest>,
    ) -> Result<Response<ListCommandsResponse>, Status> {
        let req = request.into_inner();
        let status_filter = match req.status_filter() {
            CommandStatusFilter::All => None,
            CommandStatusFilter::Running => Some("running"),
            CommandStatusFilter::Completed => Some("completed"),
            CommandStatusFilter::Failed => Some("failed"),
        };
        let limit = if req.limit == 0 { 50 } else { req.limit };

        let db = self.executor.db().lock().await;
        let (records, total_count) = db
            .list_commands(status_filter, limit, req.offset)
            .map_err(|e| Status::internal(e.to_string()))?;

        let commands = records
            .into_iter()
            .map(|r| {
                let spec = parse_spec_json(&r.spec_json);
                CommandRecord {
                    id: r.id,
                    spec,
                    status: r.status.as_str().to_string(),
                    exit_code: r.exit_code,
                    pid: r.pid,
                    created_at: r.created_at,
                    started_at: r.started_at,
                    completed_at: r.completed_at,
                    output_chunks: vec![],
                }
            })
            .collect();

        Ok(Response::new(ListCommandsResponse {
            commands,
            total_count,
        }))
    }

    async fn stream_output(
        &self,
        request: Request<StreamOutputRequest>,
    ) -> Result<Response<Self::StreamOutputStream>, Status> {
        let req = request.into_inner();

        // First, try to subscribe to a live stream
        if let Some(mut rx) = self.executor.subscribe(&req.command_id).await {
            let from_seq = req.from_sequence;
            let stream = async_stream::stream! {
                while let Ok(event) = rx.recv().await {
                    // Filter by sequence if it's an output chunk
                    if let Some(sprinter_proto::command_event::Event::Output(ref chunk)) = event.event {
                        if chunk.sequence < from_seq {
                            continue;
                        }
                    }
                    yield Ok(event);
                }
            };
            return Ok(Response::new(Box::pin(stream)));
        }

        // Command is not running — replay from DB
        let db = self.executor.db().lock().await;
        let chunks = db
            .get_output_chunks(&req.command_id, req.from_sequence)
            .map_err(|e| Status::internal(e.to_string()))?;

        let command_id = req.command_id.clone();
        let stream = async_stream::stream! {
            for chunk in chunks {
                yield Ok(CommandEvent {
                    command_id: command_id.clone(),
                    event: Some(sprinter_proto::command_event::Event::Output(OutputChunk {
                        stream: match chunk.stream.as_str() {
                            "stdout" => OutputStream::Stdout as i32,
                            "stderr" => OutputStream::Stderr as i32,
                            _ => OutputStream::Unspecified as i32,
                        },
                        data: chunk.data,
                        sequence: chunk.sequence,
                        timestamp: chunk.timestamp,
                    })),
                });
            }
        };

        Ok(Response::new(Box::pin(stream)))
    }

    async fn ping(
        &self,
        _request: Request<PingRequest>,
    ) -> Result<Response<PingResponse>, Status> {
        let running = self.executor.db().lock().await;
        // Count running commands from DB
        let (running_cmds, _) = running
            .list_commands(Some("running"), 0, 0)
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(PingResponse {
            version: env!("CARGO_PKG_VERSION").to_string(),
            uptime_seconds: self.started_at.elapsed().as_secs(),
            running_commands: running_cmds.len() as u32,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_spec_json_stored_format() {
        // This is the format actually stored in the DB by executor.rs
        let json = r#"{"shell":{"command_line":"echo hello","working_directory":""}}"#;
        let spec = parse_spec_json(json);
        assert!(spec.is_some(), "should parse stored DB format");
        let spec = spec.unwrap();
        match spec.spec {
            Some(command_spec::Spec::Shell(shell)) => {
                assert_eq!(shell.command_line, "echo hello");
            }
            None => panic!("spec variant should be Shell"),
        }
    }

    #[test]
    fn test_parse_spec_json_with_env() {
        let json = r#"{"shell":{"command_line":"ls","working_directory":"/tmp","env":{"FOO":"bar"}}}"#;
        let spec = parse_spec_json(json).unwrap();
        match spec.spec {
            Some(command_spec::Spec::Shell(shell)) => {
                assert_eq!(shell.command_line, "ls");
                assert_eq!(shell.working_directory, "/tmp");
                assert_eq!(shell.env.get("FOO").unwrap(), "bar");
            }
            None => panic!("spec variant should be Shell"),
        }
    }
}

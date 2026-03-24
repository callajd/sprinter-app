use crate::executor::CommandExecutor;
use sprinter_proto::command_service_server::CommandService;
use sprinter_proto::*;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Instant;
use tokio_stream::Stream;
use tonic::{Request, Response, Status};

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

        let spec: Option<CommandSpec> = serde_json::from_str(&record.spec_json).ok();

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
                let spec: Option<CommandSpec> = serde_json::from_str(&r.spec_json).ok();
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

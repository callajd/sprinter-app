mod daemon_manager;
mod grpc_client;

use daemon_manager::DaemonManager;
use grpc_client::{CommandEventJson, CommandRecordJson, CommandSpecJson, OutputChunkJson};
use sprinter_proto::command_service_client::CommandServiceClient;
use sprinter_proto::*;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use tonic::transport::Channel;

struct DaemonState {
    manager: DaemonManager,
    client: Mutex<Option<CommandServiceClient<Channel>>>,
}

impl DaemonState {
    async fn get_client(&self) -> Result<CommandServiceClient<Channel>, String> {
        let mut guard = self.client.lock().await;
        if let Some(ref client) = *guard {
            return Ok(client.clone());
        }

        let client = self.manager.ensure_running().await?;
        *guard = Some(client.clone());
        Ok(client)
    }
}

#[tauri::command]
async fn execute_command(
    state: State<'_, Arc<DaemonState>>,
    app: AppHandle,
    spec: CommandSpecJson,
) -> Result<serde_json::Value, String> {
    let mut client = state.get_client().await?;

    let proto_spec = spec.into_proto();
    let response = client
        .execute_command(ExecuteCommandRequest {
            spec: Some(proto_spec),
        })
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = response.into_inner();

    // Read the first event to get the command_id
    let first_event = stream
        .message()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Stream ended before started event")?;

    let command_id = first_event.command_id.clone();

    // Extract started metadata for the return value
    let (pid, started_at) = match &first_event.event {
        Some(command_event::Event::Started(s)) => (Some(s.pid), Some(s.started_at.clone())),
        _ => (None, None),
    };

    // Spawn background task to forward remaining events
    tokio::spawn(async move {
        while let Ok(Some(event)) = stream.message().await {
            if let Some(json_event) = CommandEventJson::from_proto(event) {
                let _ = app.emit("command-event", &json_event);
            }
        }
    });

    Ok(serde_json::json!({
        "command_id": command_id,
        "pid": pid,
        "started_at": started_at,
    }))
}

#[tauri::command]
async fn execute_ephemeral_command(
    state: State<'_, Arc<DaemonState>>,
    spec: CommandSpecJson,
) -> Result<serde_json::Value, String> {
    let mut client = state.get_client().await?;

    let proto_spec = spec.into_proto();
    let response = client
        .execute_ephemeral_command(ExecuteEphemeralCommandRequest {
            spec: Some(proto_spec),
        })
        .await
        .map_err(|e| e.to_string())?;

    let result = response.into_inner();
    Ok(serde_json::json!({
        "exit_code": result.exit_code,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }))
}

#[tauri::command]
async fn kill_command(
    state: State<'_, Arc<DaemonState>>,
    command_id: String,
    signal: Option<i32>,
) -> Result<bool, String> {
    let mut client = state.get_client().await?;

    let response = client
        .kill_command(KillCommandRequest {
            command_id,
            signal: signal.unwrap_or(15),
        })
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.into_inner().success)
}

#[tauri::command]
async fn get_command(
    state: State<'_, Arc<DaemonState>>,
    command_id: String,
    include_output: Option<bool>,
) -> Result<CommandRecordJson, String> {
    let mut client = state.get_client().await?;

    let response = client
        .get_command(GetCommandRequest {
            command_id,
            include_output: include_output.unwrap_or(false),
        })
        .await
        .map_err(|e| e.to_string())?;

    let record = response
        .into_inner()
        .command
        .ok_or("No command found")?;

    Ok(CommandRecordJson::from_proto(record))
}

#[tauri::command]
async fn list_commands(
    state: State<'_, Arc<DaemonState>>,
    status_filter: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<CommandRecordJson>, String> {
    let mut client = state.get_client().await?;

    let filter = match status_filter.as_deref() {
        Some("running") => CommandStatusFilter::Running,
        Some("completed") => CommandStatusFilter::Completed,
        Some("failed") => CommandStatusFilter::Failed,
        _ => CommandStatusFilter::All,
    };

    let response = client
        .list_commands(ListCommandsRequest {
            status_filter: filter as i32,
            limit: limit.unwrap_or(50),
            offset: offset.unwrap_or(0),
        })
        .await
        .map_err(|e| e.to_string())?;

    let commands = response
        .into_inner()
        .commands
        .into_iter()
        .map(CommandRecordJson::from_proto)
        .collect();

    Ok(commands)
}

#[tauri::command]
async fn get_command_output(
    state: State<'_, Arc<DaemonState>>,
    command_id: String,
) -> Result<Vec<OutputChunkJson>, String> {
    let mut client = state.get_client().await?;

    let response = client
        .get_command(GetCommandRequest {
            command_id,
            include_output: true,
        })
        .await
        .map_err(|e| e.to_string())?;

    let record = response
        .into_inner()
        .command
        .ok_or("No command found")?;

    let chunks = record
        .output_chunks
        .into_iter()
        .map(OutputChunkJson::from_proto)
        .collect();

    Ok(chunks)
}

#[tauri::command]
async fn daemon_status(state: State<'_, Arc<DaemonState>>) -> Result<serde_json::Value, String> {
    let mut client = state.get_client().await?;

    let response = client
        .ping(PingRequest {})
        .await
        .map_err(|e| e.to_string())?;

    let ping = response.into_inner();
    Ok(serde_json::json!({
        "version": ping.version,
        "uptime_seconds": ping.uptime_seconds,
        "running_commands": ping.running_commands,
    }))
}

#[tauri::command]
fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let daemon_state = Arc::new(DaemonState {
                manager: DaemonManager::new(),
                client: Mutex::new(None),
            });
            app.manage(daemon_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_command,
            execute_ephemeral_command,
            kill_command,
            get_command,
            get_command_output,
            list_commands,
            daemon_status,
            get_cwd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

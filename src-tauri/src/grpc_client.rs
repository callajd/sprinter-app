use serde::{Deserialize, Serialize};
use sprinter_proto::*;

/// JSON-friendly command spec for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CommandSpecJson {
    #[serde(rename = "shell")]
    Shell {
        command_line: String,
        #[serde(default)]
        working_directory: String,
        #[serde(default)]
        env: std::collections::HashMap<String, String>,
    },
}

impl CommandSpecJson {
    pub fn into_proto(self) -> CommandSpec {
        match self {
            CommandSpecJson::Shell {
                command_line,
                working_directory,
                env,
            } => CommandSpec {
                spec: Some(command_spec::Spec::Shell(ShellCommand {
                    command_line,
                    working_directory,
                    env,
                })),
            },
        }
    }
}

/// JSON-friendly command event for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CommandEventJson {
    #[serde(rename = "started")]
    Started {
        command_id: String,
        pid: i64,
        started_at: String,
    },
    #[serde(rename = "output")]
    Output {
        command_id: String,
        stream: String,
        data: String,
        sequence: u64,
    },
    #[serde(rename = "completed")]
    Completed {
        command_id: String,
        exit_code: i32,
        completed_at: String,
    },
    #[serde(rename = "failed")]
    Failed {
        command_id: String,
        error: String,
        failed_at: String,
    },
}

impl CommandEventJson {
    pub fn from_proto(event: CommandEvent) -> Option<Self> {
        let command_id = event.command_id;
        match event.event? {
            command_event::Event::Started(s) => Some(CommandEventJson::Started {
                command_id,
                pid: s.pid,
                started_at: s.started_at,
            }),
            command_event::Event::Output(o) => {
                let stream = match o.stream {
                    x if x == OutputStream::Stdout as i32 => "stdout",
                    x if x == OutputStream::Stderr as i32 => "stderr",
                    _ => "stdout",
                };
                Some(CommandEventJson::Output {
                    command_id,
                    stream: stream.to_string(),
                    data: String::from_utf8_lossy(&o.data).to_string(),
                    sequence: o.sequence,
                })
            }
            command_event::Event::Completed(c) => Some(CommandEventJson::Completed {
                command_id,
                exit_code: c.exit_code,
                completed_at: c.completed_at,
            }),
            command_event::Event::Failed(f) => Some(CommandEventJson::Failed {
                command_id,
                error: f.error,
                failed_at: f.failed_at,
            }),
        }
    }
}

/// JSON-friendly command record for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRecordJson {
    pub id: String,
    pub command_line: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub pid: Option<i64>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

impl CommandRecordJson {
    pub fn from_proto(record: CommandRecord) -> Self {
        let command_line = record
            .spec
            .and_then(|s| s.spec)
            .map(|s| match s {
                command_spec::Spec::Shell(shell) => shell.command_line,
            })
            .unwrap_or_default();

        Self {
            id: record.id,
            command_line,
            status: record.status,
            exit_code: record.exit_code,
            pid: record.pid,
            created_at: record.created_at,
            started_at: record.started_at,
            completed_at: record.completed_at,
        }
    }
}
